package app

import (
	"context"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"
)

// Directory garde en mémoire ce dont un scan a besoin (cartes, étudiants,
// cours proches) : un pointage se valide sans aucune requête SQL.
type Directory struct {
	a       *App
	snap    atomic.Pointer[snapshot]
	dirty   atomic.Bool
	loading sync.Mutex
}

type dirCard struct {
	ID          string
	UID         string
	Kind        string
	StudentID   string
	Status      string
	LastCounter int
	YearLabel   string
	YearEnds    *time.Time
}

type dirStudent struct {
	ID        string
	Name      string
	Matricule string
	ClassID   string
	ClassName string
	Filiere   string
	Active    bool
	HasPhoto  bool
}

type dirSession struct {
	ID         string
	ClassID    string
	ModuleName string
	Starts     time.Time
	Ends       time.Time
	Status     string
	Mode       string
}

type snapshot struct {
	cardsByUID map[string]*dirCard
	cardsByID  map[string]*dirCard
	students   map[string]*dirStudent
	sessions   map[string]*dirSession
	byClass    map[string][]*dirSession
	loadedAt   time.Time
}

const dirMaxAge = 20 * time.Second

func newDirectory(a *App) *Directory { return &Directory{a: a} }

// Invalidate force un rechargement au prochain accès.
func (d *Directory) Invalidate() { d.dirty.Store(true) }

// get renvoie l'instantané courant. Pendant un rechargement, les autres
// requêtes continuent sur l'ancien instantané au lieu d'attendre.
func (d *Directory) get(ctx context.Context) (*snapshot, error) {
	s := d.snap.Load()
	if s != nil && !d.dirty.Load() && time.Since(s.loadedAt) < dirMaxAge {
		return s, nil
	}
	if s != nil {
		if !d.loading.TryLock() {
			return s, nil
		}
	} else {
		d.loading.Lock()
	}
	defer d.loading.Unlock()
	if cur := d.snap.Load(); cur != nil && cur != s {
		return cur, nil
	}
	d.dirty.Store(false)
	ns, err := d.load(ctx)
	if err != nil {
		d.dirty.Store(true)
		if s != nil {
			slog.Error("annuaire : rechargement impossible, ancien instantané conservé", "err", err)
			return s, nil
		}
		return nil, err
	}
	d.snap.Store(ns)
	return ns, nil
}

func (d *Directory) load(ctx context.Context) (*snapshot, error) {
	s := &snapshot{
		cardsByUID: map[string]*dirCard{},
		cardsByID:  map[string]*dirCard{},
		students:   map[string]*dirStudent{},
		sessions:   map[string]*dirSession{},
		byClass:    map[string][]*dirSession{},
		loadedAt:   time.Now(),
	}
	pool := d.a.Pool
	rows, err := pool.Query(ctx, `
		SELECT k.id, k.uid, k.kind, k.student_id, k.status, k.last_counter, COALESCE(y.label, ''), y.ends_on
		FROM id_cards k LEFT JOIN academic_years y ON y.id = k.academic_year_id`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		c := &dirCard{}
		if err := rows.Scan(&c.ID, &c.UID, &c.Kind, &c.StudentID, &c.Status, &c.LastCounter, &c.YearLabel, &c.YearEnds); err != nil {
			rows.Close()
			return nil, err
		}
		s.cardsByUID[c.UID] = c
		s.cardsByID[c.ID] = c
	}
	rows.Close()
	rows, err = pool.Query(ctx, `
		SELECT s.user_id, u.full_name, s.matricule, s.class_id, c.name, f.name, u.active, s.photo IS NOT NULL
		FROM students s JOIN users u ON u.id = s.user_id JOIN classes c ON c.id = s.class_id JOIN filieres f ON f.id = c.filiere_id`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		st := &dirStudent{}
		if err := rows.Scan(&st.ID, &st.Name, &st.Matricule, &st.ClassID, &st.ClassName, &st.Filiere, &st.Active, &st.HasPhoto); err != nil {
			rows.Close()
			return nil, err
		}
		s.students[st.ID] = st
	}
	rows.Close()
	rows, err = pool.Query(ctx, `
		SELECT cs.id, cs.class_id, m.name, cs.starts_at, cs.ends_at, cs.status, cs.mode
		FROM course_sessions cs JOIN modules m ON m.id = cs.module_id
		WHERE cs.starts_at BETWEEN now() - interval '36 hours' AND now() + interval '36 hours'`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		se := &dirSession{}
		if err := rows.Scan(&se.ID, &se.ClassID, &se.ModuleName, &se.Starts, &se.Ends, &se.Status, &se.Mode); err != nil {
			rows.Close()
			return nil, err
		}
		s.sessions[se.ID] = se
		s.byClass[se.ClassID] = append(s.byClass[se.ClassID], se)
	}
	rows.Close()
	return s, rows.Err()
}

// session cherche un cours dans l'instantané, puis en base s'il est hors fenêtre.
func (d *Directory) session(ctx context.Context, s *snapshot, id string) (*dirSession, error) {
	if se, ok := s.sessions[id]; ok {
		return se, nil
	}
	se := &dirSession{ID: id}
	err := d.a.Pool.QueryRow(ctx, `
		SELECT cs.class_id, m.name, cs.starts_at, cs.ends_at, cs.status, cs.mode
		FROM course_sessions cs JOIN modules m ON m.id = cs.module_id WHERE cs.id = $1`, id).
		Scan(&se.ClassID, &se.ModuleName, &se.Starts, &se.Ends, &se.Status, &se.Mode)
	if err != nil {
		return nil, mapPgErr(err, "")
	}
	return se, nil
}

// currentSession renvoie le cours de la classe ouvert au pointage à l'instant t.
func (s *snapshot) currentSession(classID string, t time.Time, before, after time.Duration) *dirSession {
	var best *dirSession
	for _, se := range s.byClass[classID] {
		if se.Status == "annule" || t.Before(se.Starts.Add(-before)) || t.After(se.Ends.Add(after)) {
			continue
		}
		// Si deux cours se suivent, on préfère celui qui a déjà commencé le plus récemment.
		if best == nil || (!t.Before(se.Starts) && se.Starts.After(best.Starts)) || (t.Before(best.Starts) && se.Starts.Before(best.Starts)) {
			best = se
		}
	}
	return best
}
