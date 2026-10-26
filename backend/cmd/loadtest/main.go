// Command loadtest mesure la tenue en charge du pointage : N étudiants
// passent leur carte NTAG 424 DNA (liens SUN signés) au même instant.
//
// Sans -url, il démarre localement une instance complète (PostgreSQL embarqué,
// API, worker) ; avec -url et -database-url, il vise un déploiement réel.
//
//	go run ./cmd/loadtest -students 10000 -concurrency 2000
package main

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	_ "time/tzdata"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"edupilot/internal/api"
	"edupilot/internal/app"
	"edupilot/internal/cache"
	"edupilot/internal/config"
	"edupilot/internal/db"
	"edupilot/internal/devpg"
	"edupilot/internal/events"
	"edupilot/internal/realtime"
	"edupilot/internal/sun"
)

func main() {
	students := flag.Int("students", 10000, "nombre d'étudiants qui pointent en même temps")
	classes := flag.Int("classes", 25, "nombre de classes")
	concurrency := flag.Int("concurrency", 2000, "requêtes HTTP simultanées")
	target := flag.String("url", "", "URL d'un déploiement (vide : instance locale)")
	dbURL := flag.String("database-url", "", "base du déploiement visé (pour préparer les données)")
	masterHex := flag.String("card-master-key", "", "clé maître des cartes du déploiement visé (hex)")
	flag.Parse()

	ctx, cancel := context.WithCancel(context.Background())
	defer time.Sleep(200 * time.Millisecond)
	defer cancel()
	master := bytes.Repeat([]byte{9}, 16)
	if *masterHex != "" {
		var err error
		if master, err = hex.DecodeString(*masterHex); err != nil || len(master) != 16 {
			log.Fatal("clé maître invalide")
		}
	}
	base := *target
	pgURL := *dbURL
	if base == "" {
		dir, _ := os.MkdirTemp("", "edupilot-load-")
		defer os.RemoveAll(dir)
		fmt.Println("Démarrage de PostgreSQL embarqué…")
		pg, err := devpg.Start(dir)
		if err != nil {
			log.Fatal(err)
		}
		defer pg.Stop()
		pgURL = pg.URL
	}
	pool, err := db.Open(ctx, pgURL, 40)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool); err != nil {
		log.Fatal(err)
	}
	if base == "" {
		base = startLocal(ctx, pool, master)
	}

	fmt.Printf("Préparation : %d étudiants, %d classes, %d cartes sécurisées…\n", *students, *classes, *students)
	sessions, uids, err := seed(ctx, pool, *students, *classes)
	if err != nil {
		log.Fatal(err)
	}
	token := login(base)
	keys := sun.MasterKeys{Master: master}
	bodies := make([][]byte, len(uids))
	for i, uid := range uids {
		e, c, _ := sun.Simulate(keys, uid, 1)
		bodies[i], _ = json.Marshal(map[string]any{"session_id": sessions[i%*classes], "card_url": "/id?e=" + e + "&c=" + c})
	}

	fmt.Printf("Tir : %d pointages, %d en parallèle…\n", len(bodies), *concurrency)
	res := fire(base, token, bodies, *concurrency)
	start := res.start
	persisted := waitPersisted(ctx, pool, len(bodies), 60*time.Second)
	res.report(time.Since(start), persisted)

	var dup int
	pool.QueryRow(ctx, `SELECT count(*) - count(DISTINCT (session_id, student_id)) FROM attendance`).Scan(&dup)
	fmt.Printf("Doublons en base             : %d\n", dup)

	fmt.Println("\nRejeu des mêmes liens (attaque par copie de lien)…")
	replay := fire(base, token, bodies, *concurrency)
	fmt.Printf("Rejeux refusés               : %d / %d\n", replay.outcomes["refuse"], len(bodies))
}

// startLocal lance API + worker dans le processus, comme EDUPILOT_ROLES=api,worker.
func startLocal(ctx context.Context, pool *pgxpool.Pool, master []byte) string {
	loc, _ := time.LoadLocation("Africa/Dakar")
	cfg := &config.Config{Location: loc, PublicURL: "https://edupilote.local", SecretKey: bytes.Repeat([]byte{7}, 32), CardMasterKey: master,
		Roles: map[string]bool{"api": true, "worker": true}}
	bus := events.NewMemory()
	a := app.New(pool, bus, cache.NewMemory(), cfg)
	hub := realtime.NewHub()
	go (&events.Relay{Pool: pool, Bus: bus}).Run(ctx)
	bus.Subscribe(ctx, events.SubOpts{Group: "scan-writer", Topics: []string{events.TopicScans}, MaxBatch: 500, Linger: 50 * time.Millisecond}, a.PersistScans)
	bus.Subscribe(ctx, events.SubOpts{Group: "audit", Topics: events.AllTopics, MaxBatch: 500, Linger: 200 * time.Millisecond}, a.ProjectAudit)
	bus.Subscribe(ctx, events.SubOpts{Group: "rt", Topics: []string{events.TopicAttendance}, MaxBatch: 200, Linger: 20 * time.Millisecond, FromLatest: true}, hub.Dispatch)
	srv := httptest.NewServer(api.New(a, hub))
	return srv.URL
}

// seed insère directement en base (COPY-like par unnest) : créer 10 000 comptes
// par l'API prendrait des minutes à cause du hachage des mots de passe.
func seed(ctx context.Context, pool *pgxpool.Pool, n, nClasses int) ([]string, [][]byte, error) {
	hash, _ := bcrypt.GenerateFromPassword([]byte("loadtest-admin-1"), bcrypt.MinCost)
	stmts := []string{
		`TRUNCATE users, academic_years, filieres, classes, outbox, audit_log CASCADE`,
		`INSERT INTO users (role, email, password_hash, full_name) VALUES ('admin', 'loadtest@edupilote.local', '` + string(hash) + `', 'Test de charge')`,
		`INSERT INTO academic_years (label, starts_on, ends_on, active) VALUES ('Charge', current_date - 30, current_date + 300, true)`,
		`INSERT INTO filieres (name) VALUES ('Charge')`,
		fmt.Sprintf(`INSERT INTO classes (filiere_id, academic_year_id, name, invite_code)
			SELECT (SELECT id FROM filieres), (SELECT id FROM academic_years), 'Classe ' || g, 'LOAD' || g FROM generate_series(1, %d) g`, nClasses),
		`INSERT INTO modules (class_id, name) SELECT id, 'Module' FROM classes`,
		`INSERT INTO course_sessions (module_id, class_id, starts_at, ends_at, status)
			SELECT m.id, m.class_id, now() - interval '5 minutes', now() + interval '2 hours', 'confirme' FROM modules m`,
	}
	for _, q := range stmts {
		if _, err := pool.Exec(ctx, q); err != nil {
			return nil, nil, fmt.Errorf("%s : %w", q[:40], err)
		}
	}
	rows, err := pool.Query(ctx, `SELECT cs.id::text, c.id::text FROM course_sessions cs JOIN classes c ON c.id = cs.class_id ORDER BY c.name`)
	if err != nil {
		return nil, nil, err
	}
	var sessions, classIDs []string
	for rows.Next() {
		var s, c string
		rows.Scan(&s, &c)
		sessions, classIDs = append(sessions, s), append(classIDs, c)
	}
	rows.Close()
	emails, names, mats, cls, uidHex := make([]string, n), make([]string, n), make([]string, n), make([]string, n), make([]string, n)
	uids := make([][]byte, n)
	for i := 0; i < n; i++ {
		emails[i], names[i], mats[i], cls[i] = fmt.Sprintf("e%d@load.local", i), fmt.Sprintf("Étudiant %d", i), fmt.Sprintf("L%06d", i), classIDs[i%len(classIDs)]
		uid := []byte{0x04, 0x10, byte(i >> 24), byte(i >> 16), byte(i >> 8), byte(i), 0x80}
		uids[i], uidHex[i] = uid, fmt.Sprintf("%X", uid)
	}
	_, err = pool.Exec(ctx, `
		WITH u AS (
			INSERT INTO users (role, email, password_hash, full_name)
			SELECT 'etudiant', e, 'x', nm FROM unnest($1::text[], $2::text[]) AS v(e, nm) RETURNING id, email
		), s AS (
			INSERT INTO students (user_id, matricule, class_id, profile_slug, enrolled_at)
			SELECT u.id, v.m, v.c::uuid, md5(v.m), now() - interval '1 day'
			FROM unnest($1::text[], $3::text[], $4::text[]) AS v(e, m, c) JOIN u ON u.email = v.e RETURNING user_id, matricule
		)
		INSERT INTO id_cards (uid, kind, student_id, academic_year_id)
		SELECT v.uid, 'sun', s.user_id, (SELECT id FROM academic_years) FROM unnest($3::text[], $5::text[]) AS v(m, uid) JOIN s ON s.matricule = v.m`,
		emails, names, mats, cls, uidHex)
	if err != nil {
		return nil, nil, err
	}
	// L'étudiant i est dans la classe i % nClasses : on renvoie les cours dans cet ordre.
	return sessions, uids, nil
}

func login(base string) string {
	body, _ := json.Marshal(map[string]string{"email": "loadtest@edupilote.local", "password": "loadtest-admin-1"})
	resp, err := http.Post(base+"/api/v1/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		log.Fatal(err)
	}
	defer resp.Body.Close()
	for _, c := range resp.Cookies() {
		if c.Name == "edupilot_session" {
			return c.Value
		}
	}
	raw, _ := io.ReadAll(resp.Body)
	log.Fatalf("connexion impossible : %d %s", resp.StatusCode, raw)
	return ""
}

type result struct {
	start     time.Time
	elapsed   time.Duration
	latencies []time.Duration
	outcomes  map[string]int
	httpErr   int64
	firstErr  atomic.Value
}

// fire envoie tous les pointages, en relâchant les goroutines au même instant.
func fire(base, token string, bodies [][]byte, concurrency int) *result {
	// Sous Linux, une file d'attente TCP pleine fait réessayer le client (SYN
	// retransmis) ; Windows refuse aussitôt. Ce dialer reproduit le comportement Linux.
	dialer := &net.Dialer{Timeout: 5 * time.Second}
	retryDial := func(ctx context.Context, network, addr string) (net.Conn, error) {
		var err error
		for i := 0; i < 20; i++ {
			var c net.Conn
			if c, err = dialer.DialContext(ctx, network, addr); err == nil {
				return c, nil
			}
			time.Sleep(time.Duration(10+i*20) * time.Millisecond)
		}
		return nil, err
	}
	tr := &http.Transport{DialContext: retryDial, MaxIdleConns: concurrency, MaxIdleConnsPerHost: concurrency, MaxConnsPerHost: concurrency, IdleConnTimeout: time.Minute}
	cl := &http.Client{Transport: tr, Timeout: 60 * time.Second}
	res := &result{latencies: make([]time.Duration, len(bodies)), outcomes: map[string]int{}}
	var mu sync.Mutex
	var next int64 = -1
	var wg sync.WaitGroup
	gate := make(chan struct{})
	// Échauffement : chaque travailleur ouvre sa connexion (150 ouvertures à la
	// fois au plus), puis tous attendent le signal de départ commun.
	dial := make(chan struct{}, 150)
	var ready sync.WaitGroup
	for w := 0; w < concurrency; w++ {
		wg.Add(1)
		ready.Add(1)
		go func() {
			defer wg.Done()
			dial <- struct{}{}
			if resp, err := cl.Get(base + "/healthz"); err == nil {
				io.Copy(io.Discard, resp.Body)
				resp.Body.Close()
			}
			<-dial
			ready.Done()
			<-gate
			for {
				i := atomic.AddInt64(&next, 1)
				if int(i) >= len(bodies) {
					return
				}
				req, _ := http.NewRequest("POST", base+"/api/v1/scans", bytes.NewReader(bodies[i]))
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("X-EduPilot", "1")
				req.Header.Set("Authorization", "Bearer "+token)
				t0 := time.Now()
				resp, err := cl.Do(req)
				res.latencies[i] = time.Since(t0)
				if err != nil {
					atomic.AddInt64(&res.httpErr, 1)
					res.firstErr.CompareAndSwap(nil, err.Error())
					continue
				}
				var out struct{ Outcome string }
				json.NewDecoder(resp.Body).Decode(&out)
				resp.Body.Close()
				if resp.StatusCode != 200 {
					out.Outcome = fmt.Sprintf("http_%d", resp.StatusCode)
				}
				mu.Lock()
				res.outcomes[out.Outcome]++
				mu.Unlock()
			}
		}()
	}
	ready.Wait()
	res.start = time.Now()
	close(gate)
	wg.Wait()
	res.elapsed = time.Since(res.start)
	return res
}

func waitPersisted(ctx context.Context, pool *pgxpool.Pool, want int, max time.Duration) int {
	deadline := time.Now().Add(max)
	var n int
	for time.Now().Before(deadline) {
		pool.QueryRow(ctx, `SELECT count(*) FROM attendance`).Scan(&n)
		if n >= want {
			return n
		}
		time.Sleep(20 * time.Millisecond)
	}
	return n
}

func (r *result) report(toPersisted time.Duration, persisted int) {
	lat := append([]time.Duration(nil), r.latencies...)
	sort.Slice(lat, func(i, j int) bool { return lat[i] < lat[j] })
	pct := func(p float64) time.Duration { return lat[int(float64(len(lat)-1)*p)] }
	n := len(lat)
	fmt.Println("\n===== Résultat =====")
	fmt.Printf("Pointages envoyés            : %d\n", n)
	fmt.Printf("Tous acceptés en             : %s (%.0f pointages/s)\n", r.elapsed.Round(time.Millisecond), float64(n)/r.elapsed.Seconds())
	fmt.Printf("Latence p50 / p95 / p99 / max: %s / %s / %s / %s\n", pct(.5).Round(time.Millisecond), pct(.95).Round(time.Millisecond), pct(.99).Round(time.Millisecond), lat[n-1].Round(time.Millisecond))
	fmt.Printf("Résultats                    : %v (erreurs réseau : %d)\n", r.outcomes, r.httpErr)
	if e := r.firstErr.Load(); e != nil {
		fmt.Printf("Première erreur réseau       : %v\n", e)
	}
	fmt.Printf("Écrits en base               : %d / %d en %s\n", persisted, n, toPersisted.Round(time.Millisecond))
	fmt.Printf("Pointages perdus             : %d\n", n-persisted)
}
