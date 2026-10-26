package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"

	"edupilot/internal/events"
)

// PersistScans écrit un lot de scan.received en une seule transaction :
// arrivées (sans doublon grâce à la clé primaire), départs et compteurs de cartes.
func (a *App) PersistScans(ctx context.Context, batch []events.Event) error {
	type key struct{ session, student string }
	arrivals := map[key]ScanData{}
	departures := map[key]ScanData{}
	counters := map[string]int{}
	for _, e := range batch {
		if e.Type != "scan.received" {
			continue
		}
		var d ScanData
		if err := json.Unmarshal(e.Data, &d); err != nil {
			slog.Error("scan illisible ignoré", "event", e.ID, "err", err)
			continue
		}
		k := key{d.SessionID, d.StudentID}
		if d.Kind == "depart" {
			departures[k] = d
		} else if cur, ok := arrivals[k]; !ok || d.At.Before(cur.At) {
			arrivals[k] = d
		}
		if d.CardID != "" && d.Counter > counters[d.CardID] {
			counters[d.CardID] = d.Counter
		}
	}
	if len(arrivals)+len(departures)+len(counters) == 0 {
		return nil
	}
	return a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		var evs []events.Event
		if len(arrivals) > 0 {
			var sess, stud, status, method, by []string
			var at []time.Time
			var lat, lng []*float64
			byKey := map[key]ScanData{}
			for k, d := range arrivals {
				sess, stud, status, method, by = append(sess, d.SessionID), append(stud, d.StudentID), append(status, d.Status), append(method, d.Method), append(by, d.RecordedBy)
				at, lat, lng = append(at, d.At), append(lat, d.Lat), append(lng, d.Lng)
				byKey[k] = d
			}
			rows, err := tx.Query(ctx, `
				INSERT INTO attendance (session_id, student_id, status, method, arrived_at, latitude, longitude, recorded_by)
				SELECT s, st, stat, m, t, la, lo, NULLIF(b, '')::uuid
				FROM unnest($1::uuid[], $2::uuid[], $3::text[], $4::text[], $5::timestamptz[], $6::float8[], $7::float8[], $8::text[])
				     AS v(s, st, stat, m, t, la, lo, b)
				WHERE EXISTS (SELECT 1 FROM course_sessions cs WHERE cs.id = v.s)
				ON CONFLICT (session_id, student_id) DO NOTHING
				RETURNING session_id::text, student_id::text`,
				sess, stud, status, method, at, lat, lng, by)
			if err != nil {
				return nil, err
			}
			for rows.Next() {
				var k key
				if err := rows.Scan(&k.session, &k.student); err != nil {
					rows.Close()
					return nil, err
				}
				d := byKey[k]
				evs = append(evs, events.New("attendance.recorded", d.RecordedBy, d.StudentID, d.SessionID, map[string]any{
					"session_id": d.SessionID, "class_id": d.ClassID, "student_id": d.StudentID, "student_name": d.StudentName,
					"status": d.Status, "method": d.Method, "at": d.At, "lat": d.Lat, "lng": d.Lng,
				}))
			}
			rows.Close()
			if err := rows.Err(); err != nil {
				return nil, err
			}
		}
		for _, d := range departures {
			tag, err := tx.Exec(ctx, `UPDATE attendance SET left_at = $3 WHERE session_id = $1 AND student_id = $2 AND left_at IS NULL AND arrived_at < $3`,
				d.SessionID, d.StudentID, d.At)
			if err != nil {
				return nil, err
			}
			if tag.RowsAffected() > 0 {
				evs = append(evs, events.New("attendance.departed", d.RecordedBy, d.StudentID, d.SessionID, map[string]any{
					"session_id": d.SessionID, "class_id": d.ClassID, "student_id": d.StudentID, "student_name": d.StudentName, "at": d.At,
				}))
			}
		}
		if len(counters) > 0 {
			var ids []string
			var vals []int32
			for id, v := range counters {
				ids, vals = append(ids, id), append(vals, int32(v))
			}
			if _, err := tx.Exec(ctx, `UPDATE id_cards k SET last_counter = v.c FROM unnest($1::uuid[], $2::int[]) AS v(id, c)
				WHERE k.id = v.id AND k.last_counter < v.c`, ids, vals); err != nil {
				return nil, err
			}
		}
		return evs, nil
	})
}

// ProjectAudit range chaque événement dans le journal consultable par l'admin.
func (a *App) ProjectAudit(ctx context.Context, batch []events.Event) error {
	var ids, types, actors, subjects []string
	var times []time.Time
	var data [][]byte
	for _, e := range batch {
		ids, types, actors, subjects = append(ids, e.ID), append(types, e.Type), append(actors, e.ActorID), append(subjects, e.Subject)
		times, data = append(times, e.OccurredAt), append(data, e.Data)
	}
	_, err := a.Pool.Exec(ctx, `
		INSERT INTO audit_log (event_id, type, actor_id, subject, occurred_at, data)
		SELECT id, t, NULLIF(ac, '')::uuid, s, o, d
		FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[], $5::timestamptz[], $6::jsonb[]) AS v(id, t, ac, s, o, d)
		ON CONFLICT (event_id) DO NOTHING`, ids, types, actors, subjects, times, data)
	return err
}

// ProcessAbsences traite les cours terminés : met à jour les séries d'absences
// et prévient l'étudiant et ses responsables quand le seuil est atteint.
// Un cours sans aucune présence est considéré comme non tenu (pas d'alerte).
func (a *App) ProcessAbsences(ctx context.Context) (int, error) {
	st, err := a.Settings(ctx)
	if err != nil {
		return 0, err
	}
	processed := 0
	for {
		done, err := a.processOneSession(ctx, st.AlertThreshold)
		if err != nil || !done {
			return processed, err
		}
		processed++
	}
}

func (a *App) processOneSession(ctx context.Context, threshold int) (bool, error) {
	found := false
	err := a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		var id, classID, module string
		var starts, ends time.Time
		var status string
		err := tx.QueryRow(ctx, `
			SELECT cs.id, cs.class_id, m.name, cs.starts_at, cs.ends_at, cs.status
			FROM course_sessions cs JOIN modules m ON m.id = cs.module_id
			WHERE cs.absences_processed_at IS NULL AND cs.ends_at < now() - interval '5 minutes'
			ORDER BY cs.ends_at LIMIT 1 FOR UPDATE OF cs SKIP LOCKED`).Scan(&id, &classID, &module, &starts, &ends, &status)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		if err != nil {
			return nil, err
		}
		found = true
		if _, err := tx.Exec(ctx, `UPDATE course_sessions SET absences_processed_at = now() WHERE id = $1`, id); err != nil {
			return nil, err
		}
		var held bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM attendance WHERE session_id = $1)`, id).Scan(&held); err != nil {
			return nil, err
		}
		if status == "annule" || !held {
			return nil, nil
		}
		rows, err := tx.Query(ctx, `
			WITH roster AS (
				SELECT s.user_id, u.full_name, (at.student_id IS NOT NULL) AS present
				FROM students s JOIN users u ON u.id = s.user_id
				LEFT JOIN attendance at ON at.session_id = $1 AND at.student_id = s.user_id
				WHERE s.class_id = $2 AND u.active AND s.enrolled_at <= $3
			)
			INSERT INTO absence_streaks (student_id, streak, last_session_id, alerted)
			SELECT user_id, CASE WHEN present THEN 0 ELSE 1 END, $1, false FROM roster
			ON CONFLICT (student_id) DO UPDATE SET
				streak = CASE WHEN EXCLUDED.streak = 0 THEN 0 ELSE absence_streaks.streak + 1 END,
				alerted = CASE WHEN EXCLUDED.streak = 0 THEN false ELSE absence_streaks.alerted END,
				last_session_id = $1
			RETURNING student_id::text, streak, alerted`, id, classID, ends)
		if err != nil {
			return nil, err
		}
		var toAlert []string
		for rows.Next() {
			var sid string
			var streak int
			var alerted bool
			if err := rows.Scan(&sid, &streak, &alerted); err != nil {
				rows.Close()
				return nil, err
			}
			if streak >= threshold && !alerted {
				toAlert = append(toAlert, sid)
			}
		}
		rows.Close()
		var evs []events.Event
		for _, sid := range toAlert {
			var name string
			tx.QueryRow(ctx, `SELECT full_name FROM users WHERE id = $1`, sid).Scan(&name)
			body := fmt.Sprintf("%s a manqué %d cours d'affilée (dernier : %s du %s).", name, threshold, module, starts.In(a.Cfg.Location).Format("02/01 à 15:04"))
			if _, err := tx.Exec(ctx, `
				INSERT INTO notifications (user_id, kind, title, body)
				SELECT $1, 'absence', 'Alerte assiduité', $2
				UNION ALL
				SELECT m.user_id, 'absence', 'Alerte assiduité', $2 FROM class_managers m WHERE m.class_id = $3`, sid, body, classID); err != nil {
				return nil, err
			}
			if _, err := tx.Exec(ctx, `UPDATE absence_streaks SET alerted = true WHERE student_id = $1`, sid); err != nil {
				return nil, err
			}
			evs = append(evs, events.New("absence.threshold_reached", "", sid, sid, map[string]any{
				"student_id": sid, "student_name": name, "class_id": classID, "session_id": id, "streak": threshold,
			}))
		}
		return evs, nil
	})
	return found, err
}

// Housekeeping supprime les données techniques périmées.
func (a *App) Housekeeping(ctx context.Context) {
	for _, q := range []string{
		`DELETE FROM device_nonces WHERE seen_at < now() - interval '10 minutes'`,
		`DELETE FROM auth_sessions WHERE expires_at < now() - interval '7 days' OR revoked_at < now() - interval '7 days'`,
		`DELETE FROM outbox WHERE published_at < now() - interval '7 days'`,
	} {
		if _, err := a.Pool.Exec(ctx, q); err != nil {
			slog.Error("nettoyage", "err", err)
		}
	}
}
