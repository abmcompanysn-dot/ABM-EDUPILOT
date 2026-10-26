// Package demo remplit une base VIDE avec une école fictive, pour les
// démonstrations et les tests manuels. Activé seulement par EDUPILOT_DEMO_SEED=1.
package demo

import (
	"context"
	"fmt"
	"log/slog"
	"math/rand"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// Comptes de démonstration (affichés dans les journaux au démarrage).
const (
	AdminEmail   = "admin@demo.edupilote.sn"
	RespEmail    = "responsable@demo.edupilote.sn"
	StudentEmail = "etudiant@demo.edupilote.sn"
	DemoPassword = "Demo-2026!"
)

var firstNames = []string{"Awa", "Moussa", "Fatou", "Ibrahima", "Khady", "Ousmane", "Aminata", "Lamine", "Rokhaya", "Pape", "Mariama", "Cheikhou", "Seynabou", "Alioune", "Coumba", "Babacar", "Adama", "Ndella", "Modou", "Astou", "Serigne", "Yacine", "Djibril", "Oumy"}
var lastNames = []string{"Ndiaye", "Sarr", "Ba", "Faye", "Thiaw", "Kane", "Gaye", "Mbaye", "Sow", "Cissé", "Fall", "Diagne", "Seck", "Ly", "Touré", "Camara", "Wade", "Niang", "Sy", "Dème"}

func Seed(ctx context.Context, pool *pgxpool.Pool, loc *time.Location) error {
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM users`).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		slog.Info("démo : base non vide, aucune donnée ajoutée")
		return nil
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(DemoPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	r := rand.New(rand.NewSource(42))
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	exec := func(q string, args ...any) error {
		_, err := tx.Exec(ctx, q, args...)
		return err
	}
	one := func(q string, args ...any) (string, error) {
		var id string
		err := tx.QueryRow(ctx, q, args...).Scan(&id)
		return id, err
	}
	if err := exec(`INSERT INTO settings (key, value) VALUES ('school', '{"school_name":"École Démo EduPilote","late_minutes":15,"alert_threshold":3,"window_before_minutes":30,"window_after_minutes":30,"departure_min_minutes":10}')`); err != nil {
		return err
	}
	now := time.Now().In(loc)
	year, err := one(`INSERT INTO academic_years (label, starts_on, ends_on, active) VALUES ('2026-2027', $1, $2, true) RETURNING id`, now.AddDate(0, -1, 0).Format(time.DateOnly), now.AddDate(0, 9, 0).Format(time.DateOnly))
	if err != nil {
		return err
	}
	adminID, err := one(`INSERT INTO users (role, email, password_hash, full_name) VALUES ('admin', $1, $2, 'Admin Démo') RETURNING id`, AdminEmail, hash)
	if err != nil {
		return err
	}
	respID, err := one(`INSERT INTO users (role, email, password_hash, full_name, phone) VALUES ('responsable', $1, $2, 'Mariama Diop', '770000001') RETURNING id`, RespEmail, hash)
	if err != nil {
		return err
	}
	type class struct {
		id      string
		modules []string
	}
	var classes []class
	plan := map[string][]string{
		"Mécatronique": {"L1", "L2"},
		"Génie civil":  {"L1"},
		"Informatique": {"L2"},
	}
	modNames := []string{"Mathématiques", "Anglais", "Français", "Chimie", "Programmation", "Métallurgie"}
	for fil, cls := range plan {
		fid, err := one(`INSERT INTO filieres (name) VALUES ($1) RETURNING id`, fil)
		if err != nil {
			return err
		}
		for _, cn := range cls {
			cid, err := one(`INSERT INTO classes (filiere_id, academic_year_id, name, invite_code) VALUES ($1, $2, $3, $4) RETURNING id`, fid, year, cn, fmt.Sprintf("DEMO%04d", r.Intn(10000)))
			if err != nil {
				return err
			}
			c := class{id: cid}
			for _, m := range modNames[:4+r.Intn(3)] {
				mid, err := one(`INSERT INTO modules (class_id, name, teacher, planned_hours) VALUES ($1, $2, $3, $4) RETURNING id`, cid, m, "Dr "+lastNames[r.Intn(len(lastNames))], 30+10*r.Intn(4))
				if err != nil {
					return err
				}
				c.modules = append(c.modules, mid)
			}
			classes = append(classes, c)
		}
	}
	if err := exec(`INSERT INTO class_managers (class_id, user_id) VALUES ($1, $2)`, classes[0].id, respID); err != nil {
		return err
	}

	// Étudiants : profils d'assiduité variés (assidus, moyens, décrocheurs).
	students := map[string][]string{}
	assiduity := map[string]float64{}
	k := 0
	for ci, c := range classes {
		size := 14 + r.Intn(8)
		for i := 0; i < size; i++ {
			name := firstNames[r.Intn(len(firstNames))] + " " + lastNames[r.Intn(len(lastNames))]
			email := fmt.Sprintf("etu%03d@demo.edupilote.sn", k)
			if ci == 0 && i == 0 {
				email, name = StudentEmail, "Awa Ndiaye"
			}
			uid, err := one(`INSERT INTO users (role, email, password_hash, full_name) VALUES ('etudiant', $1, $2, $3) RETURNING id`, email, hash, name)
			if err != nil {
				return err
			}
			if err := exec(`INSERT INTO students (user_id, matricule, class_id, birth_date, profile_slug, enrolled_at, headline, profile_public) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
				uid, fmt.Sprintf("2026%04d", 1000+k), c.id, now.AddDate(-19-r.Intn(4), -r.Intn(12), 0).Format(time.DateOnly), fmt.Sprintf("demo%06x", r.Int31()), now.AddDate(0, -1, 0),
				"Étudiant(e) en "+[]string{"mécatronique", "génie civil", "informatique"}[ci%3], ci == 0 && i == 0); err != nil {
				return err
			}
			if r.Float64() < 0.8 {
				kind, cardUID := "uid", fmt.Sprintf("DE%06X", r.Int31n(1<<24))
				if r.Float64() < 0.5 {
					kind, cardUID = "sun", fmt.Sprintf("04D3%010X", r.Int63n(1<<40))
				}
				if err := exec(`INSERT INTO id_cards (uid, kind, student_id, academic_year_id, issued_by) VALUES ($1, $2, $3, $4, $5)`, cardUID, kind, uid, year, adminID); err != nil {
					return err
				}
			}
			p := 0.88
			switch {
			case i%7 == 3:
				p = 0.35
			case i%5 == 2:
				p = 0.6
			}
			assiduity[uid] = p
			students[c.id] = append(students[c.id], uid)
			k++
		}
	}

	// Trois semaines de cours passés (2 par jour ouvré), plus un cours en cours aujourd'hui.
	day := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	for d := 21; d >= 1; d-- {
		date := day.AddDate(0, 0, -d)
		if wd := date.Weekday(); wd == time.Saturday || wd == time.Sunday {
			continue
		}
		for ci, c := range classes {
			for slot, hour := range []int{8, 14} {
				start := date.Add(time.Duration(hour) * time.Hour)
				status := "confirme"
				if r.Float64() < 0.05 {
					status = "annule"
				}
				sid, err := one(`INSERT INTO course_sessions (module_id, class_id, starts_at, ends_at, room, status, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
					c.modules[(d+slot+ci)%len(c.modules)], c.id, start, start.Add(3*time.Hour+30*time.Minute), fmt.Sprintf("Salle %c%d", 'A'+ci, 10+slot), status, respID)
				if err != nil {
					return err
				}
				if status == "annule" {
					continue
				}
				for _, st := range students[c.id] {
					if r.Float64() > assiduity[st] {
						continue
					}
					late := r.Float64() < 0.12
					arrive := start.Add(time.Duration(r.Intn(12)-6) * time.Minute)
					stt := "present"
					if late {
						stt, arrive = "retard", start.Add(time.Duration(16+r.Intn(30))*time.Minute)
					}
					method := []string{"nfc", "nfc", "nfc", "porte", "manuel"}[r.Intn(5)]
					if err := exec(`INSERT INTO attendance (session_id, student_id, status, method, arrived_at, left_at, recorded_by) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
						sid, st, stt, method, arrive, start.Add(3*time.Hour+time.Duration(r.Intn(25))*time.Minute), respID); err != nil {
						return err
					}
				}
			}
		}
	}
	for ci, c := range classes {
		start := now.Truncate(time.Minute).Add(-time.Duration(10+ci*5) * time.Minute)
		if h := start.Hour(); h < 7 || h > 20 {
			start = day.Add(time.Duration(8+ci)*time.Hour).AddDate(0, 0, 1)
		}
		if err := exec(`INSERT INTO course_sessions (module_id, class_id, starts_at, ends_at, room, status, created_by) VALUES ($1, $2, $3, $4, 'Amphi B', 'confirme', $5)`,
			c.modules[0], c.id, start, start.Add(2*time.Hour), respID); err != nil {
			return err
		}
	}
	if err := exec(`INSERT INTO announcements (author_id, class_id, title, body) VALUES ($1, NULL, 'Bienvenue sur EduPilote', 'Les cartes d''étudiant NFC sont distribuées cette semaine au secrétariat. Pensez à vérifier votre photo dans « Ma carte ».'), ($2, $3, 'Examen de mathématiques', 'L''examen aura lieu jeudi à 8 h en salle A10. Présence obligatoire.')`,
		adminID, respID, classes[0].id); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	slog.Info("démo : école fictive créée", "admin", AdminEmail, "responsable", RespEmail, "etudiant", StudentEmail, "mot_de_passe", DemoPassword, "etudiants", k)
	return nil
}
