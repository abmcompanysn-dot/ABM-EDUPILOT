package app

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"edupilot/internal/events"
)

// ---------------------------------------------------------------- modules

type Module struct {
	ID           string  `json:"id"`
	ClassID      string  `json:"class_id"`
	Name         string  `json:"name"`
	Teacher      string  `json:"teacher"`
	PlannedHours int     `json:"planned_hours"`
	Status       string  `json:"status"`
	Sessions     int     `json:"sessions"`
	HoursDone    float64 `json:"hours_done"`
}

func (a *App) ListModules(ctx context.Context, p *Principal, classID string) ([]Module, error) {
	if !p.CanManageClass(classID) && !(p.Role == RoleStudent && len(p.ClassIDs) > 0 && p.ClassIDs[0] == classID) {
		return nil, ErrForbidden
	}
	rows, err := a.Pool.Query(ctx, `
		SELECT m.id, m.class_id, m.name, m.teacher, m.planned_hours, m.status,
		       count(cs.id) FILTER (WHERE cs.status <> 'annule' AND cs.ends_at < now())::int,
		       COALESCE(sum(extract(epoch FROM cs.ends_at - cs.starts_at) / 3600) FILTER (WHERE cs.status <> 'annule' AND cs.ends_at < now()), 0)::float8
		FROM modules m LEFT JOIN course_sessions cs ON cs.module_id = m.id
		WHERE m.class_id = $1 GROUP BY m.id ORDER BY m.name`, classID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Module])
}

type ModuleInput struct {
	Name         string `json:"name"`
	Teacher      string `json:"teacher"`
	PlannedHours int    `json:"planned_hours"`
	Status       string `json:"status"`
}

func (a *App) SaveModule(ctx context.Context, p *Principal, classID, id string, in ModuleInput) (Module, error) {
	if id != "" {
		if err := a.Pool.QueryRow(ctx, `SELECT class_id FROM modules WHERE id = $1`, id).Scan(&classID); err != nil {
			return Module{}, mapPgErr(err, "")
		}
	}
	if err := requireClass(p, classID); err != nil {
		return Module{}, err
	}
	in.Name, in.Teacher = strings.TrimSpace(in.Name), strings.TrimSpace(in.Teacher)
	if in.Name == "" {
		return Module{}, invalid("le nom du module est obligatoire")
	}
	if in.Status == "" {
		in.Status = "en_cours"
	}
	if in.Status != "en_cours" && in.Status != "termine" {
		return Module{}, invalid("statut de module inconnu")
	}
	err := a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		var err error
		if id == "" {
			err = tx.QueryRow(ctx, `INSERT INTO modules (class_id, name, teacher, planned_hours, status) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
				classID, in.Name, in.Teacher, in.PlannedHours, in.Status).Scan(&id)
		} else {
			_, err = tx.Exec(ctx, `UPDATE modules SET name = $2, teacher = $3, planned_hours = $4, status = $5 WHERE id = $1`,
				id, in.Name, in.Teacher, in.PlannedHours, in.Status)
		}
		if err != nil {
			return nil, mapPgErr(err, "cette classe a déjà un module de ce nom")
		}
		return []events.Event{ev(p, "module.saved", id, in)}, nil
	})
	if err != nil {
		return Module{}, err
	}
	mods, err := a.ListModules(ctx, p, classID)
	for _, m := range mods {
		if m.ID == id {
			return m, nil
		}
	}
	return Module{}, err
}

func (a *App) DeleteModule(ctx context.Context, p *Principal, id string) error {
	var classID string
	if err := a.Pool.QueryRow(ctx, `SELECT class_id FROM modules WHERE id = $1`, id).Scan(&classID); err != nil {
		return mapPgErr(err, "")
	}
	if err := requireClass(p, classID); err != nil {
		return err
	}
	err := a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		var held bool
		tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM attendance at JOIN course_sessions cs ON cs.id = at.session_id WHERE cs.module_id = $1)`, id).Scan(&held)
		if held {
			return nil, invalid("ce module a déjà des présences : passez-le en « terminé » au lieu de le supprimer")
		}
		_, err := tx.Exec(ctx, `DELETE FROM modules WHERE id = $1`, id)
		return []events.Event{ev(p, "module.deleted", id, nil)}, err
	})
	a.Dir.Invalidate()
	return err
}

// ---------------------------------------------------------------- cours

type Session struct {
	ID         string    `json:"id"`
	ClassID    string    `json:"class_id"`
	ClassName  string    `json:"class_name"`
	ModuleID   string    `json:"module_id"`
	ModuleName string    `json:"module_name"`
	Teacher    string    `json:"teacher"`
	StartsAt   time.Time `json:"starts_at"`
	EndsAt     time.Time `json:"ends_at"`
	Room       string    `json:"room"`
	Mode       string    `json:"mode"`
	Status     string    `json:"status"`
	Present    int       `json:"present"`
	Expected   int       `json:"expected"`
	MyStatus   *string   `json:"my_status,omitempty"`
}

const sessionSelect = `
	SELECT cs.id, cs.class_id, c.name, cs.module_id, m.name, m.teacher, cs.starts_at, cs.ends_at, cs.room, cs.mode, cs.status,
	       (SELECT count(*) FROM attendance at WHERE at.session_id = cs.id AND at.status <> 'excuse')::int,
	       (SELECT count(*) FROM students s JOIN users u ON u.id = s.user_id WHERE s.class_id = cs.class_id AND u.active AND s.enrolled_at <= cs.ends_at)::int
	FROM course_sessions cs JOIN modules m ON m.id = cs.module_id JOIN classes c ON c.id = cs.class_id`

func scanSessions(rows pgx.Rows) ([]Session, error) {
	defer rows.Close()
	out := []Session{}
	for rows.Next() {
		var s Session
		if err := rows.Scan(&s.ID, &s.ClassID, &s.ClassName, &s.ModuleID, &s.ModuleName, &s.Teacher, &s.StartsAt, &s.EndsAt, &s.Room, &s.Mode, &s.Status, &s.Present, &s.Expected); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func canSeeClass(p *Principal, classID string) bool {
	return p.CanManageClass(classID) || (p.Role == RoleStudent && len(p.ClassIDs) > 0 && p.ClassIDs[0] == classID)
}

// ListSessions renvoie le planning d'une classe sur une période (31 jours max).
func (a *App) ListSessions(ctx context.Context, p *Principal, classID string, from, to time.Time) ([]Session, error) {
	if !canSeeClass(p, classID) {
		return nil, ErrForbidden
	}
	if to.Sub(from) > 62*24*time.Hour || !to.After(from) {
		return nil, invalid("période invalide (62 jours maximum)")
	}
	rows, err := a.Pool.Query(ctx, sessionSelect+` WHERE cs.class_id = $1 AND cs.starts_at >= $2 AND cs.starts_at < $3 ORDER BY cs.starts_at`, classID, from, to)
	if err != nil {
		return nil, err
	}
	return scanSessions(rows)
}

func (a *App) GetSession(ctx context.Context, p *Principal, id string) (Session, error) {
	rows, err := a.Pool.Query(ctx, sessionSelect+` WHERE cs.id = $1`, id)
	if err != nil {
		return Session{}, err
	}
	list, err := scanSessions(rows)
	if err != nil {
		return Session{}, err
	}
	if len(list) == 0 {
		return Session{}, ErrNotFound
	}
	if !canSeeClass(p, list[0].ClassID) {
		return Session{}, ErrForbidden
	}
	return list[0], nil
}

type SessionInput struct {
	ModuleID string    `json:"module_id"`
	StartsAt time.Time `json:"starts_at"`
	EndsAt   time.Time `json:"ends_at"`
	Room     string    `json:"room"`
	Mode     string    `json:"mode"`
	Status   string    `json:"status"`
}

// SaveSession crée ou modifie un cours ; les incohérences vues dans le pilote
// (fin avant début, durée nulle, cours en double) sont refusées ici.
func (a *App) SaveSession(ctx context.Context, p *Principal, id string, in SessionInput) (Session, error) {
	var classID string
	if err := a.Pool.QueryRow(ctx, `SELECT class_id FROM modules WHERE id = $1`, in.ModuleID).Scan(&classID); err != nil {
		return Session{}, invalid("module introuvable")
	}
	if err := requireClass(p, classID); err != nil {
		return Session{}, err
	}
	if id != "" {
		var cur string
		if err := a.Pool.QueryRow(ctx, `SELECT class_id FROM course_sessions WHERE id = $1`, id).Scan(&cur); err != nil {
			return Session{}, mapPgErr(err, "")
		}
		if cur != classID {
			return Session{}, invalid("un cours ne peut pas changer de classe")
		}
	}
	if in.Mode == "" {
		in.Mode = "presentiel"
	}
	if in.Status == "" {
		in.Status = "prevu"
	}
	switch {
	case in.StartsAt.IsZero() || in.EndsAt.IsZero():
		return Session{}, invalid("heures de début et de fin obligatoires")
	case !in.EndsAt.After(in.StartsAt):
		return Session{}, invalid("l'heure de fin doit être après l'heure de début")
	case in.EndsAt.Sub(in.StartsAt) > 12*time.Hour:
		return Session{}, invalid("un cours ne peut pas durer plus de 12 heures")
	case in.Mode != "presentiel" && in.Mode != "en_ligne":
		return Session{}, invalid("mode de cours inconnu")
	case in.Status != "prevu" && in.Status != "confirme" && in.Status != "annule":
		return Session{}, invalid("statut de cours inconnu")
	}
	local := in.StartsAt.In(a.Cfg.Location)
	if h := local.Hour(); h < 6 || h >= 23 {
		return Session{}, invalid("horaire inhabituel (%s) : les cours doivent commencer entre 6 h et 23 h", local.Format("15:04"))
	}
	err := a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		var clashName string
		var clashStart time.Time
		err := tx.QueryRow(ctx, `
			SELECT m.name, cs.starts_at FROM course_sessions cs JOIN modules m ON m.id = cs.module_id
			WHERE cs.class_id = $1 AND cs.status <> 'annule' AND cs.id::text <> $2 AND cs.starts_at < $4 AND cs.ends_at > $3 LIMIT 1`,
			classID, id, in.StartsAt, in.EndsAt).Scan(&clashName, &clashStart)
		switch {
		case err == nil && in.Status != "annule":
			return nil, invalid("ce créneau chevauche un autre cours de la classe : %s (%s)", clashName, clashStart.In(a.Cfg.Location).Format("15:04"))
		case err != nil && !errors.Is(err, pgx.ErrNoRows):
			return nil, err
		}
		if id == "" {
			err = tx.QueryRow(ctx, `INSERT INTO course_sessions (module_id, class_id, starts_at, ends_at, room, mode, status, created_by)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
				in.ModuleID, classID, in.StartsAt, in.EndsAt, strings.TrimSpace(in.Room), in.Mode, in.Status, p.UserID).Scan(&id)
		} else {
			_, err = tx.Exec(ctx, `UPDATE course_sessions SET module_id = $2, starts_at = $3, ends_at = $4, room = $5, mode = $6, status = $7 WHERE id = $1`,
				id, in.ModuleID, in.StartsAt, in.EndsAt, strings.TrimSpace(in.Room), in.Mode, in.Status)
		}
		if err != nil {
			return nil, mapPgErr(err, "")
		}
		return []events.Event{ev(p, "session.saved", id, map[string]any{"class_id": classID, "module_id": in.ModuleID, "starts_at": in.StartsAt, "status": in.Status})}, nil
	})
	if err != nil {
		return Session{}, err
	}
	a.Dir.Invalidate()
	return a.GetSession(ctx, p, id)
}

func (a *App) SetSessionStatus(ctx context.Context, p *Principal, id, status string) (Session, error) {
	s, err := a.GetSession(ctx, p, id)
	if err != nil {
		return s, err
	}
	in := SessionInput{ModuleID: s.ModuleID, StartsAt: s.StartsAt, EndsAt: s.EndsAt, Room: s.Room, Mode: s.Mode, Status: status}
	return a.SaveSession(ctx, p, id, in)
}

func (a *App) DeleteSession(ctx context.Context, p *Principal, id string) error {
	s, err := a.GetSession(ctx, p, id)
	if err != nil {
		return err
	}
	if err := requireClass(p, s.ClassID); err != nil {
		return err
	}
	if s.Present > 0 {
		return invalid("ce cours a des présences : annulez-le au lieu de le supprimer")
	}
	err = a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		_, err := tx.Exec(ctx, `DELETE FROM course_sessions WHERE id = $1`, id)
		return []events.Event{ev(p, "session.deleted", id, map[string]any{"class_id": s.ClassID})}, err
	})
	a.Dir.Invalidate()
	return err
}

// CurrentSession renvoie le cours ouvert au pointage pour une classe, s'il existe.
func (a *App) CurrentSession(ctx context.Context, p *Principal, classID string) (*Session, error) {
	if !canSeeClass(p, classID) {
		return nil, ErrForbidden
	}
	snap, err := a.Dir.get(ctx)
	if err != nil {
		return nil, err
	}
	st, _ := a.Settings(ctx)
	se := snap.currentSession(classID, a.Now(), minutes(st.WindowBeforeMinutes), minutes(st.WindowAfterMinutes))
	if se == nil {
		return nil, nil
	}
	s, err := a.GetSession(ctx, p, se.ID)
	return &s, err
}

func minutes(n int) time.Duration { return time.Duration(n) * time.Minute }

// ---------------------------------------------------------------- feuille de présence

type RosterEntry struct {
	StudentID string     `json:"student_id"`
	FullName  string     `json:"full_name"`
	Matricule string     `json:"matricule"`
	HasPhoto  bool       `json:"has_photo"`
	Status    *string    `json:"status"`
	Method    *string    `json:"method"`
	ArrivedAt *time.Time `json:"arrived_at"`
	LeftAt    *time.Time `json:"left_at"`
	Note      string     `json:"note"`
}

func (a *App) Roster(ctx context.Context, p *Principal, sessionID string) (Session, []RosterEntry, error) {
	s, err := a.GetSession(ctx, p, sessionID)
	if err != nil {
		return s, nil, err
	}
	if err := requireClass(p, s.ClassID); err != nil {
		return s, nil, err
	}
	rows, err := a.Pool.Query(ctx, `
		SELECT s.user_id, u.full_name, s.matricule, s.photo IS NOT NULL, at.status, at.method, at.arrived_at, at.left_at, COALESCE(at.note, '')
		FROM students s JOIN users u ON u.id = s.user_id
		LEFT JOIN attendance at ON at.session_id = $1 AND at.student_id = s.user_id
		WHERE s.class_id = $2 AND (u.active OR at.student_id IS NOT NULL)
		ORDER BY u.full_name`, sessionID, s.ClassID)
	if err != nil {
		return s, nil, err
	}
	list, err := pgx.CollectRows(rows, pgx.RowToStructByPos[RosterEntry])
	return s, list, err
}

type MarkInput struct {
	Status string `json:"status"` // present, retard, excuse ou absent
	Method string `json:"method"` // manuel (défaut) ou en_ligne
	Note   string `json:"note"`
}

// MarkAttendance : saisie manuelle par le responsable (cours en ligne, oubli de carte, excuse).
func (a *App) MarkAttendance(ctx context.Context, p *Principal, sessionID string, studentIDs []string, in MarkInput) error {
	s, err := a.GetSession(ctx, p, sessionID)
	if err != nil {
		return err
	}
	if err := requireClass(p, s.ClassID); err != nil {
		return err
	}
	if s.Status == "annule" {
		return invalid("ce cours est annulé")
	}
	if in.Method == "" {
		in.Method = "manuel"
	}
	if in.Method != "manuel" && in.Method != "en_ligne" {
		return invalid("méthode de saisie inconnue")
	}
	if in.Status != "present" && in.Status != "retard" && in.Status != "excuse" && in.Status != "absent" {
		return invalid("statut de présence inconnu")
	}
	if len(studentIDs) == 0 || len(studentIDs) > 1000 {
		return invalid("sélectionnez entre 1 et 1 000 étudiants")
	}
	now := a.Now()
	err = a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		var names map[string]string
		rows, err := tx.Query(ctx, `SELECT s.user_id, u.full_name FROM students s JOIN users u ON u.id = s.user_id WHERE s.user_id::text = ANY($1) AND s.class_id = $2`, studentIDs, s.ClassID)
		if err != nil {
			return nil, err
		}
		names = map[string]string{}
		for rows.Next() {
			var id, name string
			rows.Scan(&id, &name)
			names[id] = name
		}
		rows.Close()
		if len(names) != len(studentIDs) {
			return nil, invalid("un des étudiants n'appartient pas à cette classe")
		}
		var evs []events.Event
		for _, sid := range studentIDs {
			if in.Status == "absent" {
				if _, err := tx.Exec(ctx, `DELETE FROM attendance WHERE session_id = $1 AND student_id = $2`, sessionID, sid); err != nil {
					return nil, err
				}
				a.Cache.Del(ctx, scanKey(sessionID, sid))
			} else {
				arrival := now
				if arrival.After(s.EndsAt) || arrival.Before(s.StartsAt.Add(-time.Hour)) {
					arrival = s.StartsAt
				}
				if _, err := tx.Exec(ctx, `
					INSERT INTO attendance (session_id, student_id, status, method, arrived_at, recorded_by, note) VALUES ($1, $2, $3, $4, $5, $6, $7)
					ON CONFLICT (session_id, student_id) DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, recorded_by = EXCLUDED.recorded_by`,
					sessionID, sid, in.Status, in.Method, arrival, p.UserID, truncate(in.Note, 300)); err != nil {
					return nil, err
				}
			}
			evs = append(evs, events.New("attendance.updated", p.UserID, sid, sessionID, map[string]any{
				"session_id": sessionID, "class_id": s.ClassID, "student_id": sid, "student_name": names[sid],
				"status": in.Status, "method": in.Method, "at": now,
			}))
		}
		return evs, nil
	})
	return err
}

func scanKey(sessionID, studentID string) string {
	return fmt.Sprintf("scan:%s:%s", sessionID, studentID)
}

// ---------------------------------------------------------------- vue étudiant

func (a *App) MySchedule(ctx context.Context, p *Principal, from, to time.Time) ([]Session, error) {
	if p.Role != RoleStudent || len(p.ClassIDs) == 0 {
		return nil, ErrForbidden
	}
	list, err := a.ListSessions(ctx, p, p.ClassIDs[0], from, to)
	if err != nil {
		return nil, err
	}
	rows, err := a.Pool.Query(ctx, `SELECT session_id::text, status FROM attendance WHERE student_id = $1 AND session_id::text = ANY($2)`, p.UserID, sessionIDs(list))
	if err != nil {
		return nil, err
	}
	mine := map[string]string{}
	for rows.Next() {
		var id, st string
		rows.Scan(&id, &st)
		mine[id] = st
	}
	rows.Close()
	now := a.Now()
	for i := range list {
		s := &list[i]
		if st, ok := mine[s.ID]; ok {
			s.MyStatus = &st
		} else if s.EndsAt.Before(now) && s.Status != "annule" && s.Present > 0 {
			abs := "absent"
			s.MyStatus = &abs
		}
	}
	return list, nil
}

func sessionIDs(list []Session) []string {
	ids := make([]string, len(list))
	for i, s := range list {
		ids[i] = s.ID
	}
	return ids
}
