package app

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"io"
	"time"

	"github.com/jackc/pgx/v5"
)

// Un cours compte dans les statistiques s'il est terminé, non annulé et
// tenu (au moins une présence) : on n'invente pas d'absences pour un cours
// qui n'a pas eu lieu. Les étudiants attendus sont ceux inscrits avant la fin.
const heldExpected = `
	held AS (
		SELECT cs.id, cs.class_id, cs.module_id, cs.starts_at, cs.ends_at
		FROM course_sessions cs
		WHERE cs.status <> 'annule' AND cs.ends_at < now() AND cs.starts_at >= $1
		  AND EXISTS (SELECT 1 FROM attendance at WHERE at.session_id = cs.id)
	),
	expected AS (
		SELECT h.id AS session_id, h.class_id, h.module_id, h.starts_at, s.user_id AS student_id,
		       at.status AS status
		FROM held h
		JOIN students s ON s.class_id = h.class_id AND s.enrolled_at <= h.ends_at
		JOIN users u ON u.id = s.user_id AND u.active
		LEFT JOIN attendance at ON at.session_id = h.id AND at.student_id = s.user_id
	)`

type Overview struct {
	Students      int           `json:"students"`
	Classes       int           `json:"classes"`
	SessionsToday int           `json:"sessions_today"`
	PresentToday  int           `json:"present_today"`
	Rate30        *float64      `json:"rate_30"`
	RatePrev30    *float64      `json:"rate_prev_30"`
	AtRisk        []RiskStudent `json:"at_risk"`
	Daily         []DailyRate   `json:"daily"`
	ByClass       []GroupRate   `json:"by_class"`
	CardsActive   int           `json:"cards_active"`
	PendingPhotos int           `json:"pending_photos"`
}

type DailyRate struct {
	Day      string  `json:"day"`
	Expected int     `json:"expected"`
	Present  int     `json:"present"`
	Rate     float64 `json:"rate"`
}

type GroupRate struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Sessions int     `json:"sessions"`
	Rate     float64 `json:"rate"`
}

type RiskStudent struct {
	ID        string  `json:"id"`
	FullName  string  `json:"full_name"`
	Matricule string  `json:"matricule"`
	ClassName string  `json:"class_name"`
	Sessions  int     `json:"sessions"`
	Rate      float64 `json:"rate"`
	Streak    int     `json:"streak"`
}

// cached met le résultat de fn en cache (Redis) quelques secondes : les
// tableaux de bord restent instantanés même ouverts par toute l'équipe.
func cached[T any](a *App, ctx context.Context, key string, ttl time.Duration, fn func() (T, error)) (T, error) {
	var v T
	if b, ok, _ := a.Cache.Get(ctx, "stats:"+key); ok && json.Unmarshal(b, &v) == nil {
		return v, nil
	}
	v, err := fn()
	if err != nil {
		return v, err
	}
	if b, err := json.Marshal(v); err == nil {
		a.Cache.Set(ctx, "stats:"+key, b, ttl)
	}
	return v, nil
}

func (a *App) Overview(ctx context.Context, p *Principal) (Overview, error) {
	if err := requireAdmin(p); err != nil {
		return Overview{}, err
	}
	return cached(a, ctx, "overview", 20*time.Second, func() (Overview, error) {
		var o Overview
		today := a.today()
		err := a.Pool.QueryRow(ctx, `
			SELECT (SELECT count(*) FROM students s JOIN users u ON u.id = s.user_id WHERE u.active)::int,
			       (SELECT count(*) FROM classes)::int,
			       (SELECT count(*) FROM course_sessions WHERE status <> 'annule' AND starts_at >= $1 AND starts_at < $2)::int,
			       (SELECT count(*) FROM attendance at JOIN course_sessions cs ON cs.id = at.session_id WHERE cs.starts_at >= $1 AND cs.starts_at < $2 AND at.status <> 'excuse')::int,
			       (SELECT count(*) FROM id_cards WHERE status = 'active')::int,
			       (SELECT count(*) FROM photo_requests WHERE status = 'en_attente')::int`,
			today, today.AddDate(0, 0, 1)).Scan(&o.Students, &o.Classes, &o.SessionsToday, &o.PresentToday, &o.CardsActive, &o.PendingPhotos)
		if err != nil {
			return o, err
		}
		from := today.AddDate(0, 0, -60)
		rows, err := a.Pool.Query(ctx, `WITH `+heldExpected+`
			SELECT to_char(starts_at AT TIME ZONE $2, 'YYYY-MM-DD') AS day, count(*)::int,
			       count(*) FILTER (WHERE status IN ('present', 'retard'))::int
			FROM expected WHERE status IS DISTINCT FROM 'excuse' GROUP BY day ORDER BY day`, from, a.Cfg.Location.String())
		if err != nil {
			return o, err
		}
		o.Daily = []DailyRate{}
		var e30, p30, ePrev, pPrev int
		cut := today.AddDate(0, 0, -30).Format(time.DateOnly)
		for rows.Next() {
			var d DailyRate
			if err := rows.Scan(&d.Day, &d.Expected, &d.Present); err != nil {
				rows.Close()
				return o, err
			}
			if d.Expected > 0 {
				d.Rate = float64(d.Present) / float64(d.Expected)
			}
			if d.Day >= cut {
				e30, p30 = e30+d.Expected, p30+d.Present
				o.Daily = append(o.Daily, d)
			} else {
				ePrev, pPrev = ePrev+d.Expected, pPrev+d.Present
			}
		}
		rows.Close()
		o.Rate30, o.RatePrev30 = ratio(p30, e30), ratio(pPrev, ePrev)
		if o.ByClass, err = a.groupRates(ctx, today.AddDate(0, 0, -30), "class", ""); err != nil {
			return o, err
		}
		o.AtRisk, err = a.atRisk(ctx, "")
		return o, err
	})
}

func ratio(n, d int) *float64 {
	if d == 0 {
		return nil
	}
	r := float64(n) / float64(d)
	return &r
}

// groupRates calcule le taux de présence par classe ou par module (d'une classe).
func (a *App) groupRates(ctx context.Context, from time.Time, by, classID string) ([]GroupRate, error) {
	q := `WITH ` + heldExpected + `
		SELECT c.id, f.name || ' ' || c.name, count(DISTINCT e.session_id)::int,
		       COALESCE(avg(CASE WHEN e.status IN ('present', 'retard') THEN 1.0 ELSE 0 END) FILTER (WHERE e.status IS DISTINCT FROM 'excuse'), 0)::float8
		FROM expected e JOIN classes c ON c.id = e.class_id JOIN filieres f ON f.id = c.filiere_id GROUP BY c.id, f.name ORDER BY 4 DESC`
	args := []any{from}
	if by == "module" {
		q = `WITH ` + heldExpected + `
			SELECT m.id, m.name, count(DISTINCT e.session_id)::int,
			       COALESCE(avg(CASE WHEN e.status IN ('present', 'retard') THEN 1.0 ELSE 0 END) FILTER (WHERE e.status IS DISTINCT FROM 'excuse'), 0)::float8
			FROM expected e JOIN modules m ON m.id = e.module_id WHERE e.class_id = $2 GROUP BY m.id ORDER BY 4 DESC`
		args = append(args, classID)
	}
	rows, err := a.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[GroupRate])
}

// atRisk liste les étudiants sous 50 % de présence (au moins 3 cours tenus).
func (a *App) atRisk(ctx context.Context, classID string) ([]RiskStudent, error) {
	rows, err := a.Pool.Query(ctx, `WITH `+heldExpected+`
		SELECT s.user_id, u.full_name, s.matricule, f.name || ' ' || c.name, count(*)::int,
		       avg(CASE WHEN e.status IN ('present', 'retard') THEN 1.0 ELSE 0 END)::float8 AS rate,
		       COALESCE(ab.streak, 0)
		FROM expected e JOIN students s ON s.user_id = e.student_id JOIN users u ON u.id = s.user_id
		JOIN classes c ON c.id = s.class_id JOIN filieres f ON f.id = c.filiere_id LEFT JOIN absence_streaks ab ON ab.student_id = s.user_id
		WHERE e.status IS DISTINCT FROM 'excuse' AND ($2 = '' OR e.class_id::text = $2)
		GROUP BY s.user_id, u.full_name, s.matricule, f.name, c.name, ab.streak
		HAVING count(*) >= 3 AND avg(CASE WHEN e.status IN ('present', 'retard') THEN 1.0 ELSE 0 END) < 0.5
		ORDER BY rate, u.full_name LIMIT 100`, a.yearStart(ctx), classID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[RiskStudent])
}

func (a *App) yearStart(ctx context.Context) time.Time {
	var d time.Time
	if a.Pool.QueryRow(ctx, `SELECT starts_on::timestamptz FROM academic_years WHERE active`).Scan(&d) != nil {
		return a.today().AddDate(-1, 0, 0)
	}
	return d
}

type StudentRate struct {
	ID        string  `json:"id"`
	FullName  string  `json:"full_name"`
	Matricule string  `json:"matricule"`
	Sessions  int     `json:"sessions"`
	Present   int     `json:"present"`
	Late      int     `json:"late"`
	Excused   int     `json:"excused"`
	Rate      float64 `json:"rate"`
	Streak    int     `json:"streak"`
}

type ClassStats struct {
	Rate     *float64      `json:"rate"`
	Sessions int           `json:"sessions"`
	ByModule []GroupRate   `json:"by_module"`
	Students []StudentRate `json:"students"`
}

func (a *App) ClassStats(ctx context.Context, p *Principal, classID string) (ClassStats, error) {
	if err := requireClass(p, classID); err != nil {
		return ClassStats{}, err
	}
	return cached(a, ctx, "class:"+classID, 15*time.Second, func() (ClassStats, error) {
		var cs ClassStats
		from := a.yearStart(ctx)
		var err error
		if cs.ByModule, err = a.groupRates(ctx, from, "module", classID); err != nil {
			return cs, err
		}
		rows, err := a.Pool.Query(ctx, `WITH `+heldExpected+`
			SELECT s.user_id, u.full_name, s.matricule, count(*)::int,
			       count(*) FILTER (WHERE e.status = 'present')::int, count(*) FILTER (WHERE e.status = 'retard')::int,
			       count(*) FILTER (WHERE e.status = 'excuse')::int,
			       COALESCE(avg(CASE WHEN e.status IN ('present', 'retard') THEN 1.0 ELSE 0 END) FILTER (WHERE e.status IS DISTINCT FROM 'excuse'), 1)::float8,
			       COALESCE(ab.streak, 0)
			FROM expected e JOIN students s ON s.user_id = e.student_id JOIN users u ON u.id = s.user_id
			LEFT JOIN absence_streaks ab ON ab.student_id = s.user_id
			WHERE e.class_id = $2 GROUP BY s.user_id, u.full_name, s.matricule, ab.streak ORDER BY 8, u.full_name`, from, classID)
		if err != nil {
			return cs, err
		}
		if cs.Students, err = pgx.CollectRows(rows, pgx.RowToStructByPos[StudentRate]); err != nil {
			return cs, err
		}
		var exp, pres int
		a.Pool.QueryRow(ctx, `WITH `+heldExpected+`
			SELECT count(DISTINCT session_id)::int, count(*) FILTER (WHERE status IS DISTINCT FROM 'excuse')::int,
			       count(*) FILTER (WHERE status IN ('present', 'retard'))::int FROM expected WHERE class_id = $2`, from, classID).Scan(&cs.Sessions, &exp, &pres)
		cs.Rate = ratio(pres, exp)
		return cs, nil
	})
}

// studentRate : taux de présence de l'année en cours (nil si aucun cours tenu).
func (a *App) studentRate(ctx context.Context, studentID string) (*float64, error) {
	var exp, pres int
	err := a.Pool.QueryRow(ctx, `WITH `+heldExpected+`
		SELECT count(*) FILTER (WHERE status IS DISTINCT FROM 'excuse')::int, count(*) FILTER (WHERE status IN ('present', 'retard'))::int
		FROM expected WHERE student_id = $2`, a.yearStart(ctx), studentID).Scan(&exp, &pres)
	return ratio(pres, exp), err
}

type HistoryEntry struct {
	SessionID  string     `json:"session_id"`
	ModuleName string     `json:"module_name"`
	StartsAt   time.Time  `json:"starts_at"`
	EndsAt     time.Time  `json:"ends_at"`
	Status     string     `json:"status"` // present, retard, excuse, absent
	Method     *string    `json:"method"`
	ArrivedAt  *time.Time `json:"arrived_at"`
	LeftAt     *time.Time `json:"left_at"`
}

type StudentAttendance struct {
	Rate     *float64       `json:"rate"`
	Streak   int            `json:"streak"`
	ByModule []GroupRate    `json:"by_module"`
	History  []HistoryEntry `json:"history"`
}

// StudentAttendance : historique d'un étudiant (lui-même ou le personnel de sa classe).
func (a *App) StudentAttendance(ctx context.Context, p *Principal, studentID string) (StudentAttendance, error) {
	var classID string
	if err := a.Pool.QueryRow(ctx, `SELECT class_id FROM students WHERE user_id = $1`, studentID).Scan(&classID); err != nil {
		return StudentAttendance{}, mapPgErr(err, "")
	}
	if p.UserID != studentID && !p.CanManageClass(classID) {
		return StudentAttendance{}, ErrForbidden
	}
	var out StudentAttendance
	from := a.yearStart(ctx)
	var err error
	if out.Rate, err = a.studentRate(ctx, studentID); err != nil {
		return out, err
	}
	a.Pool.QueryRow(ctx, `SELECT streak FROM absence_streaks WHERE student_id = $1`, studentID).Scan(&out.Streak)
	rows, err := a.Pool.Query(ctx, `WITH `+heldExpected+`
		SELECT m.id, m.name, count(*)::int,
		       COALESCE(avg(CASE WHEN e.status IN ('present', 'retard') THEN 1.0 ELSE 0 END) FILTER (WHERE e.status IS DISTINCT FROM 'excuse'), 1)::float8
		FROM expected e JOIN modules m ON m.id = e.module_id WHERE e.student_id = $2 GROUP BY m.id ORDER BY m.name`, from, studentID)
	if err != nil {
		return out, err
	}
	if out.ByModule, err = pgx.CollectRows(rows, pgx.RowToStructByPos[GroupRate]); err != nil {
		return out, err
	}
	rows, err = a.Pool.Query(ctx, `WITH `+heldExpected+`
		SELECT e.session_id, m.name, cs.starts_at, cs.ends_at, COALESCE(at.status, 'absent'), at.method, at.arrived_at, at.left_at
		FROM expected e JOIN course_sessions cs ON cs.id = e.session_id JOIN modules m ON m.id = cs.module_id
		LEFT JOIN attendance at ON at.session_id = e.session_id AND at.student_id = e.student_id
		WHERE e.student_id = $2 ORDER BY cs.starts_at DESC LIMIT 300`, from, studentID)
	if err != nil {
		return out, err
	}
	out.History, err = pgx.CollectRows(rows, pgx.RowToStructByPos[HistoryEntry])
	return out, err
}

// ExportAttendanceCSV écrit la feuille de présence détaillée d'une classe.
func (a *App) ExportAttendanceCSV(ctx context.Context, p *Principal, classID string, from, to time.Time, w io.Writer) error {
	if err := requireClass(p, classID); err != nil {
		return err
	}
	rows, err := a.Pool.Query(ctx, `
		SELECT to_char(cs.starts_at AT TIME ZONE $4, 'YYYY-MM-DD'), to_char(cs.starts_at AT TIME ZONE $4, 'HH24:MI'), m.name,
		       s.matricule, u.full_name, COALESCE(at.status, 'absent'),
		       COALESCE(to_char(at.arrived_at AT TIME ZONE $4, 'HH24:MI'), ''), COALESCE(to_char(at.left_at AT TIME ZONE $4, 'HH24:MI'), ''),
		       COALESCE(at.method, ''), COALESCE(at.note, '')
		FROM course_sessions cs JOIN modules m ON m.id = cs.module_id
		JOIN students s ON s.class_id = cs.class_id AND s.enrolled_at <= cs.ends_at JOIN users u ON u.id = s.user_id
		LEFT JOIN attendance at ON at.session_id = cs.id AND at.student_id = s.user_id
		WHERE cs.class_id = $1 AND cs.status <> 'annule' AND cs.starts_at >= $2 AND cs.starts_at < $3 AND cs.ends_at < now()
		  AND EXISTS (SELECT 1 FROM attendance x WHERE x.session_id = cs.id)
		ORDER BY cs.starts_at, u.full_name`, classID, from, to, a.Cfg.Location.String())
	if err != nil {
		return err
	}
	defer rows.Close()
	w.Write([]byte{0xEF, 0xBB, 0xBF}) // BOM : Excel ouvre correctement les accents
	cw := csv.NewWriter(w)
	cw.Comma = ';'
	cw.Write([]string{"Date", "Heure", "Module", "Matricule", "Nom", "Statut", "Arrivée", "Départ", "Méthode", "Note"})
	for rows.Next() {
		rec := make([]string, 10)
		ptrs := make([]any, 10)
		for i := range rec {
			ptrs[i] = &rec[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return err
		}
		cw.Write(rec)
	}
	cw.Flush()
	return rows.Err()
}

// ---------------------------------------------------------------- journal

type AuditEntry struct {
	EventID    string          `json:"event_id"`
	Type       string          `json:"type"`
	ActorName  *string         `json:"actor_name"`
	Subject    string          `json:"subject"`
	OccurredAt time.Time       `json:"occurred_at"`
	Data       json.RawMessage `json:"data"`
}

func (a *App) ListAudit(ctx context.Context, p *Principal, typePrefix string, before *time.Time, limit int) ([]AuditEntry, error) {
	if err := requireAdmin(p); err != nil {
		return nil, err
	}
	if before == nil {
		t := a.Now().Add(time.Minute)
		before = &t
	}
	rows, err := a.Pool.Query(ctx, `
		SELECT l.event_id, l.type, u.full_name, l.subject, l.occurred_at, l.data
		FROM audit_log l LEFT JOIN users u ON u.id = l.actor_id
		WHERE l.occurred_at < $1 AND ($2 = '' OR l.type LIKE $2 || '%')
		ORDER BY l.occurred_at DESC LIMIT $3`, *before, typePrefix, clampLimit(limit, 100, 500))
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[AuditEntry])
}
