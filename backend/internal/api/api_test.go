package api_test

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	_ "time/tzdata"

	"github.com/jackc/pgx/v5/pgxpool"

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

var (
	testPool *pgxpool.Pool
	testURL  string
)

func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "edupilot-test-")
	if err != nil {
		panic(err)
	}
	pg, err := devpg.Start(dir)
	if err != nil {
		panic(err)
	}
	testURL = pg.URL
	ctx := context.Background()
	testPool, err = db.Open(ctx, pg.URL, 20)
	if err != nil {
		panic(err)
	}
	if err := db.Migrate(ctx, testPool); err != nil {
		panic(err)
	}
	code := m.Run()
	testPool.Close()
	pg.Stop()
	os.RemoveAll(dir)
	os.Exit(code)
}

// env monte une instance complète (API + worker) sur une base vidée.
type env struct {
	t   *testing.T
	app *app.App
	srv *httptest.Server
}

func newEnv(t *testing.T) *env {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	_, err := testPool.Exec(ctx, `TRUNCATE settings, users, academic_years, filieres, classes, devices, outbox, audit_log, feedback CASCADE`)
	if err != nil {
		t.Fatal(err)
	}
	// Les tests tournent à toute heure : on se place dans un fuseau où il est midi,
	// pour respecter la règle « un cours commence entre 6 h et 23 h ».
	off := 12 - time.Now().UTC().Hour()
	if off > 12 {
		off -= 24
	}
	if off < -11 {
		off += 24
	}
	zone := "Etc/GMT"
	if off > 0 {
		zone = fmt.Sprintf("Etc/GMT-%d", off)
	} else if off < 0 {
		zone = fmt.Sprintf("Etc/GMT+%d", -off)
	}
	loc, err := time.LoadLocation(zone)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &config.Config{
		Location: loc, PublicURL: "https://edupilote.test",
		SecretKey: bytes.Repeat([]byte{7}, 32), CardMasterKey: bytes.Repeat([]byte{9}, 16),
		Roles: map[string]bool{"api": true, "worker": true},
	}
	bus := events.NewMemory()
	a := app.New(testPool, bus, cache.NewMemory(), cfg)
	hub := realtime.NewHub()
	go (&events.Relay{Pool: testPool, Bus: bus}).Run(ctx)
	bus.Subscribe(ctx, events.SubOpts{Group: "scan-writer", Topics: []string{events.TopicScans}, MaxBatch: 500, Linger: 10 * time.Millisecond}, a.PersistScans)
	bus.Subscribe(ctx, events.SubOpts{Group: "audit", Topics: events.AllTopics, MaxBatch: 500, Linger: 10 * time.Millisecond}, a.ProjectAudit)
	bus.Subscribe(ctx, events.SubOpts{Group: "rt", Topics: []string{events.TopicAttendance}, MaxBatch: 100, Linger: time.Millisecond}, hub.Dispatch)
	if err := a.BootstrapAdmin(ctx, "admin@ecole.test", "admin-secret-1"); err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(api.New(a, hub))
	t.Cleanup(srv.Close)
	return &env{t: t, app: a, srv: srv}
}

type client struct {
	e    *env
	http *http.Client
}

func (e *env) client() *client {
	jar, _ := cookiejar.New(nil)
	return &client{e: e, http: &http.Client{Jar: jar}}
}

func (e *env) login(email, password string) *client {
	c := e.client()
	c.must("POST", "/api/v1/auth/login", map[string]string{"email": email, "password": password}, nil)
	return c
}

// do envoie une requête JSON et décode la réponse dans out ; renvoie le code HTTP.
func (c *client) do(method, path string, body any, out any) (int, string) {
	c.e.t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, c.e.srv.URL+path, rd)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-EduPilot", "1")
	resp, err := c.http.Do(req)
	if err != nil {
		c.e.t.Fatal(err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if out != nil && resp.StatusCode < 300 && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			c.e.t.Fatalf("%s %s : réponse illisible %s", method, path, raw)
		}
	}
	return resp.StatusCode, string(raw)
}

func (c *client) must(method, path string, body, out any) {
	c.e.t.Helper()
	if code, raw := c.do(method, path, body, out); code >= 300 {
		c.e.t.Fatalf("%s %s : %d %s", method, path, code, raw)
	}
}

func (c *client) expect(code int, method, path string, body any) string {
	c.e.t.Helper()
	got, raw := c.do(method, path, body, nil)
	if got != code {
		c.e.t.Fatalf("%s %s : attendu %d, obtenu %d %s", method, path, code, got, raw)
	}
	return raw
}

// eventually réessaie f jusqu'à ce qu'elle réussisse (traitements asynchrones du worker).
func eventually(t *testing.T, what string, f func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if f() {
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatalf("délai dépassé : %s", what)
}

type id struct {
	ID string `json:"id"`
}

type school struct {
	admin, resp       *client
	classID, class2ID string
	students          map[string]string // matricule -> id
	moduleID          string
	sessionID         string
	sunUID            []byte
}

// setup crée une école minimale : une classe, un responsable, trois étudiants.
func (e *env) setup() *school {
	s := &school{admin: e.login("admin@ecole.test", "admin-secret-1"), students: map[string]string{}}
	today := time.Now()
	var year id
	s.admin.must("POST", "/api/v1/years", map[string]any{"label": "2026-2027", "starts_on": today.AddDate(0, -1, 0).Format(time.DateOnly), "ends_on": today.AddDate(0, 9, 0).Format(time.DateOnly), "active": true}, &year)
	var fil id
	s.admin.must("POST", "/api/v1/filieres", map[string]string{"name": "Mécatronique"}, &fil)
	var cl, cl2 id
	s.admin.must("POST", "/api/v1/classes", map[string]any{"name": "L2", "filiere_id": fil.ID, "academic_year_id": year.ID}, &cl)
	s.admin.must("POST", "/api/v1/classes", map[string]any{"name": "L1", "filiere_id": fil.ID}, &cl2)
	s.classID, s.class2ID = cl.ID, cl2.ID
	var staff struct {
		TempPassword string `json:"temp_password"`
	}
	s.admin.must("POST", "/api/v1/staff", map[string]any{"role": "responsable", "email": "resp@ecole.test", "full_name": "Awa Responsable", "class_ids": []string{cl.ID}}, &staff)
	s.resp = e.login("resp@ecole.test", staff.TempPassword)
	for _, m := range []string{"A", "B", "C"} {
		var out struct {
			Student      id     `json:"student"`
			TempPassword string `json:"temp_password"`
		}
		s.resp.must("POST", "/api/v1/students", map[string]any{"full_name": "Étudiant " + m, "email": strings.ToLower(m) + "@ecole.test", "matricule": "MAT" + m, "class_id": cl.ID}, &out)
		s.students[m] = out.Student.ID
	}
	var mod id
	s.resp.must("POST", "/api/v1/classes/"+cl.ID+"/modules", map[string]any{"name": "Mathématiques", "teacher": "Dr Ba", "planned_hours": 40}, &mod)
	s.moduleID = mod.ID
	now := time.Now().Truncate(time.Minute)
	var se id
	s.resp.must("POST", "/api/v1/sessions", map[string]any{"module_id": mod.ID, "starts_at": now.Add(-5 * time.Minute), "ends_at": now.Add(90 * time.Minute), "room": "B12", "status": "confirme"}, &se)
	s.sessionID = se.ID
	s.sunUID, _ = hex.DecodeString("04A1B2C3D4E5F6")
	s.admin.must("POST", "/api/v1/students/"+s.students["A"]+"/cards", map[string]string{"uid": "04:a1:b2:c3:d4:e5:f6", "kind": "sun"}, nil)
	s.admin.must("POST", "/api/v1/students/"+s.students["B"]+"/cards", map[string]string{"uid": "1A2B3C4D", "kind": "uid"}, nil)
	return s
}

func (e *env) sunURL(uid []byte, counter int) string {
	ec, cc, err := sun.Simulate(e.app.Keys, uid, counter)
	if err != nil {
		e.t.Fatal(err)
	}
	return "https://edupilote.test/id?e=" + ec + "&c=" + cc
}

type scanRes struct {
	Outcome string `json:"outcome"`
	Message string `json:"message"`
}

func (s *school) scan(body map[string]any) scanRes {
	body["session_id"] = s.sessionID
	var r scanRes
	s.resp.must("POST", "/api/v1/scans", body, &r)
	return r
}

func TestPointageCompletEtJournal(t *testing.T) {
	e := newEnv(t)
	s := e.setup()

	// Carte sécurisée : présent, puis rejeu refusé, puis nouveau passage = « déjà pointé ».
	if r := s.scan(map[string]any{"card_url": e.sunURL(s.sunUID, 1)}); r.Outcome != "present" {
		t.Fatalf("premier passage : %+v", r)
	}
	if r := s.scan(map[string]any{"card_url": e.sunURL(s.sunUID, 1)}); r.Outcome != "refuse" || !strings.Contains(r.Message, "déjà utilisé") {
		t.Fatalf("rejeu non détecté : %+v", r)
	}
	if r := s.scan(map[string]any{"card_url": e.sunURL(s.sunUID, 2)}); r.Outcome != "deja" {
		t.Fatalf("second passage : %+v", r)
	}
	// Lien falsifié.
	forged := strings.Replace(e.sunURL(s.sunUID, 3), "&c=", "&c=00", 1)[:len(e.sunURL(s.sunUID, 3))]
	if r := s.scan(map[string]any{"card_url": forged}); r.Outcome != "refuse" {
		t.Fatalf("lien falsifié accepté : %+v", r)
	}
	// Puce simple, lue par son UID au format Web NFC.
	if r := s.scan(map[string]any{"card_uid": "1a:2b:3c:4d"}); r.Outcome != "present" {
		t.Fatalf("puce simple : %+v", r)
	}
	// Une carte sécurisée lue par son seul UID (clone possible) est refusée.
	if r := s.scan(map[string]any{"card_uid": "04A1B2C3D4E5F6"}); r.Outcome != "refuse" {
		t.Fatalf("UID d'une carte sécurisée accepté : %+v", r)
	}
	// Saisie manuelle : C excusé.
	s.resp.must("POST", "/api/v1/sessions/"+s.sessionID+"/attendance", map[string]any{"student_ids": []string{s.students["C"]}, "status": "excuse", "note": "certificat médical"}, nil)

	type roster struct {
		Students []struct {
			StudentID string  `json:"student_id"`
			Status    *string `json:"status"`
			Method    *string `json:"method"`
		} `json:"students"`
	}
	eventually(t, "présences écrites par le worker", func() bool {
		var r roster
		s.resp.must("GET", "/api/v1/sessions/"+s.sessionID+"/roster", nil, &r)
		got := map[string]string{}
		for _, st := range r.Students {
			if st.Status != nil {
				got[st.StudentID] = *st.Status + "/" + *st.Method
			}
		}
		return got[s.students["A"]] == "present/nfc" && got[s.students["B"]] == "present/nfc" && got[s.students["C"]] == "excuse/manuel"
	})

	// Le journal (alimenté par le bus) contient l'émission de carte et les présences.
	eventually(t, "journal complet", func() bool {
		var entries []struct{ Type string }
		s.admin.must("GET", "/api/v1/audit?limit=500", nil, &entries)
		seen := map[string]bool{}
		for _, en := range entries {
			seen[en.Type] = true
		}
		return seen["card.issued"] && seen["attendance.recorded"] && seen["user.login"] && seen["session.saved"]
	})

	// Le compteur de la carte est mémorisé en base (anti-rejeu durable).
	eventually(t, "compteur de carte persisté", func() bool {
		var ctr int
		testPool.QueryRow(context.Background(), `SELECT last_counter FROM id_cards WHERE uid = '04A1B2C3D4E5F6'`).Scan(&ctr)
		return ctr >= 2
	})
}

func TestPointageParQR(t *testing.T) {
	e := newEnv(t)
	s := e.setup()
	studentLogin := func(id, email string) *client {
		var out struct {
			TempPassword string `json:"temp_password"`
		}
		s.admin.must("POST", "/api/v1/users/"+id+"/reset-password", nil, &out)
		return e.login(email, out.TempPassword)
	}
	a := studentLogin(s.students["A"], "a@ecole.test")

	// Seul le personnel obtient le QR à projeter.
	a.expect(http.StatusForbidden, "GET", "/api/v1/sessions/"+s.sessionID+"/qr", nil)
	var qr struct {
		Token string `json:"token"`
		URL   string `json:"url"`
	}
	s.resp.must("GET", "/api/v1/sessions/"+s.sessionID+"/qr", nil, &qr)
	if qr.Token == "" || !strings.HasPrefix(qr.URL, "https://edupilote.test/presence?t=") {
		t.Fatalf("QR : %+v", qr)
	}

	checkin := func(c *client, tok string) scanRes {
		var r scanRes
		c.must("POST", "/api/v1/checkin", map[string]any{"token": tok}, &r)
		return r
	}
	if r := checkin(a, qr.Token); r.Outcome != "present" {
		t.Fatalf("pointage QR : %+v", r)
	}
	if r := checkin(a, qr.Token); r.Outcome != "deja" {
		t.Fatalf("second pointage QR : %+v", r)
	}
	if r := checkin(a, qr.Token+"x"); r.Outcome != "refuse" {
		t.Fatalf("jeton falsifié accepté : %+v", r)
	}
	// Le personnel ne pointe pas à la place d'un étudiant avec ce lien.
	s.resp.expect(http.StatusForbidden, "POST", "/api/v1/checkin", map[string]any{"token": qr.Token})

	// Un étudiant d'une autre classe est refusé.
	var other struct {
		Student id `json:"student"`
	}
	s.admin.must("POST", "/api/v1/students", map[string]any{"full_name": "Étudiant D", "email": "d@ecole.test", "matricule": "MATD", "class_id": s.class2ID}, &other)
	d := studentLogin(other.Student.ID, "d@ecole.test")
	if r := checkin(d, qr.Token); r.Outcome != "refuse" {
		t.Fatalf("étudiant d'une autre classe accepté : %+v", r)
	}

	eventually(t, "présence QR écrite par le worker", func() bool {
		var r struct {
			Students []struct {
				StudentID string  `json:"student_id"`
				Method    *string `json:"method"`
			} `json:"students"`
		}
		s.resp.must("GET", "/api/v1/sessions/"+s.sessionID+"/roster", nil, &r)
		for _, st := range r.Students {
			if st.StudentID == s.students["A"] && st.Method != nil && *st.Method == "qr" {
				return true
			}
		}
		return false
	})
}

func TestPageIdentite(t *testing.T) {
	e := newEnv(t)
	s := e.setup()
	anon := e.client()
	type idRes struct {
		Status  string `json:"status"`
		Proof   string `json:"proof"`
		Student *struct {
			FullName  string `json:"full_name"`
			YearLabel string `json:"year_label"`
			ID        string `json:"id"`
		} `json:"student"`
		Staff *struct {
			Matricule      string `json:"matricule"`
			CurrentSession *id    `json:"current_session"`
		} `json:"staff"`
	}
	verify := func(c *client, counter int) idRes {
		u := e.sunURL(s.sunUID, counter)
		var r idRes
		c.must("GET", "/api/v1/id/verify?"+u[strings.Index(u, "?")+1:], nil, &r)
		return r
	}
	r := verify(anon, 10)
	if r.Status != "valide" || r.Student.FullName != "Étudiant A" || r.Student.YearLabel != "2026-2027" || r.Staff != nil {
		t.Fatalf("vérification publique : %+v", r)
	}
	if v := verify(anon, 10); v.Status != "rejeu" || v.Student != nil {
		t.Fatalf("une capture du lien doit être refusée : %+v", v)
	}
	// La photo n'est accessible qu'avec la preuve de vérification.
	anon.expect(http.StatusForbidden, "GET", "/api/v1/id/photo/"+s.students["A"], nil)
	// Le responsable voit les informations réservées et peut pointer depuis la page (cas iPhone).
	r = verify(s.resp, 11)
	if r.Staff == nil || r.Staff.Matricule != "MATA" || r.Staff.CurrentSession == nil {
		t.Fatalf("vue du personnel : %+v", r)
	}
	if res := s.scan(map[string]any{"proof": r.Proof}); res.Outcome != "present" {
		t.Fatalf("pointage par preuve : %+v", res)
	}
	// Carte déclarée perdue : refusée partout.
	var cards []struct{ ID, Kind string }
	s.admin.must("GET", "/api/v1/cards?status=active&student_id="+s.students["A"], nil, &cards)
	s.admin.must("POST", "/api/v1/cards/"+cards[0].ID+"/revoke", map[string]string{"reason": "perdue"}, nil)
	if v := verify(anon, 12); v.Status != "perdue" {
		t.Fatalf("carte perdue : %+v", v)
	}
	if res := s.scan(map[string]any{"card_url": e.sunURL(s.sunUID, 13)}); res.Outcome != "refuse" {
		t.Fatalf("carte perdue acceptée au pointage : %+v", res)
	}
}

func TestPorte(t *testing.T) {
	e := newEnv(t)
	s := e.setup()
	var dev struct {
		Device id     `json:"device"`
		Secret string `json:"secret"`
	}
	s.admin.must("POST", "/api/v1/devices", map[string]any{"name": "Entrée A", "open_ms": 4000}, &dev)
	call := func(nonce string, payload map[string]any, secret string) (int, map[string]any) {
		payload["device_id"], payload["ts"], payload["nonce"] = dev.Device.ID, time.Now().Unix(), nonce
		body, _ := json.Marshal(payload)
		key, _ := hex.DecodeString(secret)
		m := hmac.New(sha256.New, key)
		m.Write(body)
		req, _ := http.NewRequest("POST", e.srv.URL+"/api/v1/devices/door/access", bytes.NewReader(body))
		req.Header.Set("X-Signature", hex.EncodeToString(m.Sum(nil)))
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer resp.Body.Close()
		var out map[string]any
		json.NewDecoder(resp.Body).Decode(&out)
		return resp.StatusCode, out
	}
	code, out := call("n1", map[string]any{"card_url": e.sunURL(s.sunUID, 1)}, dev.Secret)
	if code != 200 || out["allow"] != true || out["open_ms"].(float64) != 4000 {
		t.Fatalf("ouverture : %d %v", code, out)
	}
	// La réponse est signée : l'ESP32 peut vérifier qu'elle vient du serveur.
	key, _ := hex.DecodeString(dev.Secret)
	m := hmac.New(sha256.New, key)
	m.Write([]byte("1|n1"))
	if out["sig"] != hex.EncodeToString(m.Sum(nil)) {
		t.Fatal("signature de la réponse incorrecte")
	}
	if code, _ := call("n1", map[string]any{"card_url": e.sunURL(s.sunUID, 2)}, dev.Secret); code != 401 {
		t.Fatalf("nonce rejoué accepté : %d", code)
	}
	if code, _ := call("n2", map[string]any{"card_uid": "1A2B3C4D"}, strings.Repeat("ab", 32)); code != 401 {
		t.Fatalf("mauvais secret accepté : %d", code)
	}
	if _, out := call("n3", map[string]any{"card_uid": "DEADBEEF"}, dev.Secret); out["allow"] != false || out["reason"] != "carte inconnue" {
		t.Fatalf("carte inconnue : %v", out)
	}
	eventually(t, "présence par la porte", func() bool {
		var method string
		testPool.QueryRow(context.Background(), `SELECT method FROM attendance WHERE student_id = $1`, s.students["A"]).Scan(&method)
		return method == "porte"
	})
	var events []struct{ Allowed bool }
	s.admin.must("GET", "/api/v1/door-events", nil, &events)
	if len(events) != 2 {
		t.Fatalf("journal de porte : %d entrées", len(events))
	}
}

func TestAlertesEtStatistiques(t *testing.T) {
	e := newEnv(t)
	s := e.setup()
	ctx := context.Background()
	// Les étudiants sont inscrits depuis dix jours : ils sont attendus aux cours passés.
	if _, err := testPool.Exec(ctx, `UPDATE students SET enrolled_at = now() - interval '10 days'`); err != nil {
		t.Fatal(err)
	}
	// Trois cours passés où seul A est présent : B et C atteignent le seuil d'alerte.
	for d := 3; d >= 1; d-- {
		day := time.Now().AddDate(0, 0, -d).Truncate(time.Minute)
		var se id
		s.resp.must("POST", "/api/v1/sessions", map[string]any{"module_id": s.moduleID, "starts_at": day.Add(-2 * time.Hour), "ends_at": day.Add(-time.Hour), "status": "confirme"}, &se)
		s.resp.must("POST", "/api/v1/sessions/"+se.ID+"/attendance", map[string]any{"student_ids": []string{s.students["A"]}, "status": "present"}, nil)
	}
	if _, err := e.app.ProcessAbsences(ctx); err != nil {
		t.Fatal(err)
	}
	var notifs []struct{ Kind, Body string }
	s.resp.must("GET", "/api/v1/me/notifications", nil, &notifs)
	if len(notifs) != 2 {
		t.Fatalf("le responsable doit recevoir 2 alertes, reçu %d : %+v", len(notifs), notifs)
	}
	var stats struct {
		Rate     *float64 `json:"rate"`
		Sessions int      `json:"sessions"`
		Students []struct {
			Matricule string  `json:"matricule"`
			Rate      float64 `json:"rate"`
			Streak    int     `json:"streak"`
		} `json:"students"`
	}
	s.resp.must("GET", "/api/v1/classes/"+s.classID+"/stats", nil, &stats)
	if stats.Sessions != 3 || stats.Rate == nil || fmt.Sprintf("%.2f", *stats.Rate) != "0.33" {
		t.Fatalf("statistiques de classe : %+v", stats)
	}
	var ov struct {
		Students int                          `json:"students"`
		AtRisk   []struct{ Matricule string } `json:"at_risk"`
	}
	s.admin.must("GET", "/api/v1/stats/overview", nil, &ov)
	if ov.Students != 3 || len(ov.AtRisk) != 2 {
		t.Fatalf("vue d'ensemble : %+v", ov)
	}
	raw := s.resp.expect(200, "GET", "/api/v1/classes/"+s.classID+"/attendance.csv?from="+time.Now().AddDate(0, 0, -7).Format(time.DateOnly)+"&to="+time.Now().AddDate(0, 0, 1).Format(time.DateOnly), nil)
	if strings.Count(raw, "\n") != 10 || !strings.Contains(raw, "absent") {
		t.Fatalf("export CSV inattendu :\n%s", raw)
	}
}

func TestEspaceEtudiantEtProfil(t *testing.T) {
	e := newEnv(t)
	s := e.setup()
	var out struct {
		TempPassword string `json:"temp_password"`
	}
	s.admin.must("POST", "/api/v1/users/"+s.students["A"]+"/reset-password", nil, &out)
	st := e.login("a@ecole.test", out.TempPassword)
	var me struct {
		MustChange bool `json:"must_change_password"`
	}
	st.must("GET", "/api/v1/auth/me", nil, &me)
	if !me.MustChange {
		t.Fatal("un mot de passe provisoire doit être changé")
	}
	st.must("POST", "/api/v1/auth/password", map[string]string{"current": out.TempPassword, "next": "nouveau-mdp-123"}, nil)
	var sched []struct {
		ModuleName string `json:"module_name"`
	}
	st.must("GET", "/api/v1/me/schedule", nil, &sched)
	if len(sched) != 1 || sched[0].ModuleName != "Mathématiques" {
		t.Fatalf("emploi du temps : %+v", sched)
	}
	// Profil pro : privé par défaut, public sur demande, sans email ni téléphone.
	var prof struct{ Slug string }
	st.must("GET", "/api/v1/me/profile", nil, &prof)
	e.client().expect(http.StatusNotFound, "GET", "/api/v1/public/profiles/"+prof.Slug, nil)
	st.must("PUT", "/api/v1/me/profile", map[string]any{"headline": "Future ingénieure", "skills": []string{"Arduino"}, "links": []map[string]string{{"label": "LinkedIn", "url": "https://linkedin.com/in/a"}}, "public": true}, nil)
	var pub map[string]any
	e.client().must("GET", "/api/v1/public/profiles/"+prof.Slug, nil, &pub)
	if pub["headline"] != "Future ingénieure" || pub["email"] != nil {
		t.Fatalf("profil public : %v", pub)
	}
	if raw := e.client().expect(200, "GET", "/api/v1/public/profiles/"+prof.Slug+"/vcard", nil); !strings.Contains(raw, "FN:Étudiant A") {
		t.Fatalf("vCard : %s", raw)
	}
	st.expect(http.StatusBadRequest, "PUT", "/api/v1/me/profile", map[string]any{"links": []map[string]string{{"label": "x", "url": "javascript:alert(1)"}}})
}

func TestDroitsEtValidations(t *testing.T) {
	e := newEnv(t)
	s := e.setup()
	var out struct {
		TempPassword string `json:"temp_password"`
	}
	s.admin.must("POST", "/api/v1/users/"+s.students["B"]+"/reset-password", nil, &out)
	st := e.login("b@ecole.test", out.TempPassword)

	st.expect(http.StatusForbidden, "GET", "/api/v1/students", nil)
	st.expect(http.StatusForbidden, "GET", "/api/v1/stats/overview", nil)
	st.expect(http.StatusForbidden, "POST", "/api/v1/scans", map[string]any{"session_id": s.sessionID, "card_uid": "1A2B3C4D"})
	s.resp.expect(http.StatusForbidden, "GET", "/api/v1/classes/"+s.class2ID+"/modules", nil)
	s.resp.expect(http.StatusForbidden, "GET", "/api/v1/audit", nil)
	s.resp.expect(http.StatusForbidden, "POST", "/api/v1/students", map[string]any{"full_name": "X", "email": "x@ecole.test", "matricule": "X1", "class_id": s.class2ID})
	e.client().expect(http.StatusUnauthorized, "GET", "/api/v1/students", nil)

	// Protection CSRF : une écriture sans l'en-tête X-EduPilot est refusée.
	req, _ := http.NewRequest("POST", e.srv.URL+"/api/v1/feedback", strings.NewReader(`{"rating":5}`))
	resp, err := s.resp.http.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("CSRF : attendu 403, obtenu %d", resp.StatusCode)
	}

	// Les erreurs de saisie du pilote sont refusées.
	base := time.Now().Truncate(time.Hour).Add(24 * time.Hour)
	s.resp.expect(http.StatusBadRequest, "POST", "/api/v1/sessions", map[string]any{"module_id": s.moduleID, "starts_at": base, "ends_at": base.Add(-time.Hour)})
	s.resp.expect(http.StatusBadRequest, "POST", "/api/v1/sessions", map[string]any{"module_id": s.moduleID, "starts_at": base, "ends_at": base})
	s.resp.must("POST", "/api/v1/sessions", map[string]any{"module_id": s.moduleID, "starts_at": base, "ends_at": base.Add(2 * time.Hour)}, nil)
	if raw := s.resp.expect(http.StatusBadRequest, "POST", "/api/v1/sessions", map[string]any{"module_id": s.moduleID, "starts_at": base.Add(time.Hour), "ends_at": base.Add(3 * time.Hour)}); !strings.Contains(raw, "chevauche") {
		t.Fatalf("chevauchement non détecté : %s", raw)
	}
	s.resp.expect(http.StatusConflict, "POST", "/api/v1/students", map[string]any{"full_name": "Doublon", "email": "a@ecole.test", "matricule": "NEW", "class_id": s.classID})

	// Limitation des tentatives de connexion.
	bad := e.client()
	for i := 0; i < 8; i++ {
		bad.do("POST", "/api/v1/auth/login", map[string]string{"email": "admin@ecole.test", "password": "faux"}, nil)
	}
	bad.expect(http.StatusTooManyRequests, "POST", "/api/v1/auth/login", map[string]string{"email": "admin@ecole.test", "password": "admin-secret-1"})
}

func TestInscriptionParInvitation(t *testing.T) {
	e := newEnv(t)
	s := e.setup()
	var cl struct {
		InviteCode string `json:"invite_code"`
	}
	s.admin.must("GET", "/api/v1/classes/"+s.classID, nil, &cl)
	var info map[string]string
	e.client().must("GET", "/api/v1/public/invite/"+strings.ToLower(cl.InviteCode), nil, &info)
	if info["class_name"] != "L2" {
		t.Fatalf("invitation : %v", info)
	}
	c := e.client()
	var me struct{ Role string }
	c.must("POST", "/api/v1/auth/register", map[string]any{"invite_code": cl.InviteCode, "full_name": "Nouvel Étudiant", "email": "new@ecole.test", "matricule": "mat-new", "password": "motdepasse-1"}, &me)
	if me.Role != "etudiant" {
		t.Fatalf("inscription : %+v", me)
	}
	s.admin.must("PUT", "/api/v1/classes/"+s.classID, map[string]any{"name": "L2", "filiere_id": mustFiliere(t, s), "invite_open": false}, nil)
	e.client().expect(http.StatusBadRequest, "GET", "/api/v1/public/invite/"+cl.InviteCode, nil)
}

func mustFiliere(t *testing.T, s *school) string {
	var cl struct {
		FiliereID string `json:"filiere_id"`
	}
	s.admin.must("GET", "/api/v1/classes/"+s.classID, nil, &cl)
	return cl.FiliereID
}

func TestPorteHorsLigne(t *testing.T) {
	e := newEnv(t)
	s := e.setup()
	var dev struct {
		Device id     `json:"device"`
		Secret string `json:"secret"`
	}
	s.admin.must("POST", "/api/v1/devices", map[string]any{"name": "Entrée B"}, &dev)
	key, _ := hex.DecodeString(dev.Secret)
	sign := func(b []byte) string {
		m := hmac.New(sha256.New, key)
		m.Write(b)
		return hex.EncodeToString(m.Sum(nil))
	}
	post := func(path string, payload map[string]any) (*http.Response, []byte) {
		payload["device_id"], payload["ts"] = dev.Device.ID, time.Now().Unix()
		payload["nonce"] = fmt.Sprintf("n-%d", time.Now().UnixNano())
		body, _ := json.Marshal(payload)
		req, _ := http.NewRequest("POST", e.srv.URL+path, bytes.NewReader(body))
		req.Header.Set("X-Signature", sign(body))
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		raw, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return resp, raw
	}

	// 1. Synchronisation : liste signée des cartes actives et des cours proches.
	resp, raw := post("/api/v1/devices/door/sync", map[string]any{})
	if resp.StatusCode != 200 || resp.Header.Get("X-Signature") != sign(raw) {
		t.Fatalf("synchronisation : %d, signature valide=%v", resp.StatusCode, resp.Header.Get("X-Signature") == sign(raw))
	}
	list := string(raw)
	if !strings.HasPrefix(list, "EDUPILOT-SYNC 1\n") || !strings.Contains(list, "C 04A1B2C3D4E5F6 "+s.classID) || !strings.Contains(list, "C 1A2B3C4D "+s.classID) || !strings.Contains(list, s.sessionID) {
		t.Fatalf("liste de synchronisation incomplète :\n%s", list)
	}

	// 2. Passages décidés pendant la coupure, remontés au retour du réseau.
	at := time.Now().Add(-2 * time.Minute).Unix()
	events := []map[string]any{
		{"id": "ev-1", "uid": "1A2B3C4D", "at": at, "allowed": true, "session_id": s.sessionID},
		{"id": "ev-2", "uid": "04A1B2C3D4E5F6", "url": "/id?e=00000000000000000000000000000000&c=0000000000000000", "at": at, "allowed": true, "session_id": s.sessionID},
	}
	_, raw = post("/api/v1/devices/door/events", map[string]any{"events": events})
	var res struct{ Accepted, Duplicates int }
	json.Unmarshal(raw, &res)
	if res.Accepted != 2 || res.Duplicates != 0 {
		t.Fatalf("remontée : %s", raw)
	}
	// 3. Renvoyer les mêmes passages ne crée aucun doublon.
	_, raw = post("/api/v1/devices/door/events", map[string]any{"events": events})
	json.Unmarshal(raw, &res)
	if res.Accepted != 0 || res.Duplicates != 2 {
		t.Fatalf("double envoi : %s", raw)
	}
	// La puce simple est comptée présente à l'heure réelle du passage ; le faux lien est refusé.
	eventually(t, "présence hors ligne", func() bool {
		var method string
		var arrived time.Time
		testPool.QueryRow(context.Background(), `SELECT method, arrived_at FROM attendance WHERE student_id = $1 AND session_id = $2`, s.students["B"], s.sessionID).Scan(&method, &arrived)
		return method == "porte" && arrived.Unix() == at
	})
	var countA int
	testPool.QueryRow(context.Background(), `SELECT count(*) FROM attendance WHERE student_id = $1`, s.students["A"]).Scan(&countA)
	var forged string
	testPool.QueryRow(context.Background(), `SELECT reason FROM door_events WHERE client_event_id = 'ev-2'`).Scan(&forged)
	if countA != 0 || !strings.Contains(forged, "non authentique") {
		t.Fatalf("faux lien hors ligne : présences=%d, motif=%q", countA, forged)
	}
}
