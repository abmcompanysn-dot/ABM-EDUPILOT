package app

import (
	"context"
	"encoding/hex"
	"errors"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"edupilot/internal/events"
	"edupilot/internal/sun"
)

type Card struct {
	ID          string     `json:"id"`
	UID         string     `json:"uid"`
	Kind        string     `json:"kind"`
	StudentID   string     `json:"student_id"`
	StudentName string     `json:"student_name"`
	Matricule   string     `json:"matricule"`
	ClassName   string     `json:"class_name"`
	Status      string     `json:"status"`
	YearLabel   *string    `json:"year_label"`
	IssuedAt    time.Time  `json:"issued_at"`
	RevokedAt   *time.Time `json:"revoked_at"`
}

const cardSelect = `
	SELECT k.id, k.uid, k.kind, k.student_id, u.full_name, s.matricule, f.name || ' ' || c.name, k.status, y.label, k.issued_at, k.revoked_at
	FROM id_cards k JOIN students s ON s.user_id = k.student_id JOIN users u ON u.id = s.user_id
	JOIN classes c ON c.id = s.class_id JOIN filieres f ON f.id = c.filiere_id LEFT JOIN academic_years y ON y.id = k.academic_year_id`

func (a *App) ListCards(ctx context.Context, p *Principal, status, studentID string) ([]Card, error) {
	if err := requireAdmin(p); err != nil {
		return nil, err
	}
	rows, err := a.Pool.Query(ctx, cardSelect+` WHERE ($1 = '' OR k.status = $1) AND ($2 = '' OR k.student_id::text = $2) ORDER BY k.issued_at DESC LIMIT 2000`, status, studentID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Card])
}

// NormalizeUID ramène un identifiant de puce à l'hexadécimal majuscule sans séparateurs
// (Web NFC renvoie « 04:a2:… », un lecteur USB « 04A2… »).
func NormalizeUID(raw string) (string, error) {
	s := strings.ToUpper(strings.NewReplacer(":", "", "-", "", " ", "").Replace(strings.TrimSpace(raw)))
	if _, err := hex.DecodeString(s); err != nil || len(s) < 8 || len(s) > 20 {
		return "", invalid("identifiant de carte invalide : %q", raw)
	}
	return s, nil
}

// Programming contient ce qu'il faut écrire sur une carte NTAG 424 DNA.
type Programming struct {
	URLTemplate    string `json:"url_template"`
	PICCDataOffset int    `json:"picc_data_offset"`
	MACOffset      int    `json:"mac_offset"`
	AppMasterKey   string `json:"app_master_key"`
	SDMMetaReadKey string `json:"sdm_meta_read_key"`
	SDMFileReadKey string `json:"sdm_file_read_key"`
}

type IssueInput struct {
	UID  string `json:"uid"`
	Kind string `json:"kind"` // sun (NTAG 424 DNA) ou uid (puce simple)
}

// IssueCard associe une carte à un étudiant ; l'ancienne carte active passe « remplacée ».
func (a *App) IssueCard(ctx context.Context, p *Principal, studentID string, in IssueInput) (Card, *Programming, error) {
	if err := requireAdmin(p); err != nil {
		return Card{}, nil, err
	}
	uid, err := NormalizeUID(in.UID)
	if err != nil {
		return Card{}, nil, err
	}
	if in.Kind != "sun" && in.Kind != "uid" {
		return Card{}, nil, invalid("type de carte inconnu (sun ou uid)")
	}
	if in.Kind == "sun" && len(uid) != 14 {
		return Card{}, nil, invalid("une carte NTAG 424 DNA a un UID de 7 octets (14 caractères)")
	}
	var id string
	err = a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		if _, err := tx.Exec(ctx, `UPDATE id_cards SET status = 'remplacee', revoked_at = now() WHERE student_id = $1 AND status = 'active'`, studentID); err != nil {
			return nil, err
		}
		err := tx.QueryRow(ctx, `INSERT INTO id_cards (uid, kind, student_id, academic_year_id, issued_by)
			VALUES ($1, $2, $3, (SELECT id FROM academic_years WHERE active), $4) RETURNING id`, uid, in.Kind, studentID, p.UserID).Scan(&id)
		if err != nil {
			return nil, mapPgErr(err, "cette carte est déjà enregistrée : révoquez-la avant de la réattribuer")
		}
		return []events.Event{ev(p, "card.issued", studentID, map[string]any{"card_id": id, "uid": uid, "kind": in.Kind})}, nil
	})
	if err != nil {
		return Card{}, nil, err
	}
	a.Dir.Invalidate()
	cards, err := a.ListCards(ctx, p, "", studentID)
	if err != nil || len(cards) == 0 {
		return Card{}, nil, err
	}
	var prog *Programming
	if in.Kind == "sun" {
		prog = a.programming(uid)
	}
	return cards[0], prog, nil
}

func (a *App) programming(uid string) *Programming {
	raw, _ := hex.DecodeString(uid)
	prefix := a.Cfg.PublicURL + "/id?e="
	return &Programming{
		URLTemplate:    prefix + strings.Repeat("0", 32) + "&c=" + strings.Repeat("0", 16),
		PICCDataOffset: len(prefix),
		MACOffset:      len(prefix) + 32 + len("&c="),
		AppMasterKey:   strings.ToUpper(hex.EncodeToString(a.Keys.Application(raw))),
		SDMMetaReadKey: strings.ToUpper(hex.EncodeToString(a.Keys.MetaRead())),
		SDMFileReadKey: strings.ToUpper(hex.EncodeToString(a.Keys.FileRead(raw))),
	}
}

func (a *App) RevokeCard(ctx context.Context, p *Principal, cardID, reason string) error {
	if err := requireAdmin(p); err != nil {
		return err
	}
	if reason != "perdue" && reason != "revoquee" {
		return invalid("motif inconnu (perdue ou revoquee)")
	}
	err := a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		var studentID string
		err := tx.QueryRow(ctx, `UPDATE id_cards SET status = $2, revoked_at = now() WHERE id = $1 AND status = 'active' RETURNING student_id`, cardID, reason).Scan(&studentID)
		if err != nil {
			return nil, mapPgErr(err, "")
		}
		return []events.Event{ev(p, "card.revoked", studentID, map[string]any{"card_id": cardID, "reason": reason})}, nil
	})
	a.Dir.Invalidate()
	return err
}

// ---------------------------------------------------------------- lecture d'une carte

// TapInput : ce que l'appareil a lu sur la carte (lien SUN, ou UID d'une puce simple).
type TapInput struct {
	URL string `json:"card_url"`
	UID string `json:"card_uid"`
}

type tapResult struct {
	card    *dirCard
	student *dirStudent
	counter int
}

// Raisons de refus, montrées telles quelles sur les écrans et la porte.
var (
	errCardUnknown = errors.New("carte inconnue")
	errCardReplay  = errors.New("lien de carte déjà utilisé : présentez la carte physique")
	errCardForged  = errors.New("carte non authentique")
)

type cardStateErr struct{ status string }

func (e cardStateErr) Error() string {
	switch e.status {
	case "perdue":
		return "carte déclarée perdue"
	case "remplacee":
		return "carte remplacée par une nouvelle carte"
	case "expiree":
		return "carte expirée (année académique terminée)"
	case "inactif":
		return "compte étudiant désactivé"
	}
	return "carte révoquée"
}

// resolveTap authentifie une lecture de carte. checkCounter applique l'anti-rejeu
// des cartes SUN (le compteur doit croître à chaque lecture).
func (a *App) resolveTap(ctx context.Context, in TapInput, checkCounter bool) (tapResult, error) {
	snap, err := a.Dir.get(ctx)
	if err != nil {
		return tapResult{}, err
	}
	var r tapResult
	if e, c := sunParams(in.URL); e != "" {
		tap, err := sun.Verify(a.Keys, e, c)
		if err != nil {
			return r, errCardForged
		}
		card := snap.cardsByUID[tap.UID]
		if card == nil {
			return r, errCardUnknown
		}
		if card.Kind != "sun" {
			return r, errCardForged
		}
		r.card, r.counter = card, tap.Counter
		if checkCounter {
			if tap.Counter <= card.LastCounter {
				return r, errCardReplay
			}
			fresh, err := a.Cache.Raise(ctx, "card:ctr:"+card.ID, int64(tap.Counter), 400*24*time.Hour)
			if err == nil && !fresh {
				return r, errCardReplay
			}
		}
	} else {
		uid, err := NormalizeUID(in.UID)
		if err != nil {
			return r, err
		}
		card := snap.cardsByUID[uid]
		if card == nil {
			return r, errCardUnknown
		}
		// Une carte sécurisée lue par son seul UID pourrait être un clone : refusée.
		if card.Kind != "uid" {
			return r, errCardForged
		}
		r.card = card
	}
	r.student = snap.students[r.card.StudentID]
	if r.student == nil {
		return r, errCardUnknown
	}
	if r.card.Status != "active" {
		return r, cardStateErr{r.card.Status}
	}
	if r.card.YearEnds != nil && a.today().After(*r.card.YearEnds) {
		return r, cardStateErr{"expiree"}
	}
	if !r.student.Active {
		return r, cardStateErr{"inactif"}
	}
	return r, nil
}

// sunParams extrait e et c d'un lien de carte (absolu ou relatif).
func sunParams(raw string) (string, string) {
	if raw == "" {
		return "", ""
	}
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return "", ""
	}
	q := u.Query()
	return q.Get("e"), q.Get("c")
}

// ---------------------------------------------------------------- page d'identité

type IDResult struct {
	Status  string     `json:"status"` // valide, expiree, perdue, revoquee, remplacee, rejeu, inconnue, invalide
	Message string     `json:"message"`
	Student *IDStudent `json:"student,omitempty"`
	Proof   string     `json:"proof,omitempty"`
	// Pour le personnel de la classe uniquement.
	Staff *IDStaff `json:"staff,omitempty"`
}

type IDStudent struct {
	ID          string    `json:"id"`
	FullName    string    `json:"full_name"`
	ClassName   string    `json:"class_name"`
	FiliereName string    `json:"filiere_name"`
	YearLabel   string    `json:"year_label"`
	SchoolName  string    `json:"school_name"`
	HasPhoto    bool      `json:"has_photo"`
	ProfileSlug string    `json:"profile_slug,omitempty"`
	CheckedAt   time.Time `json:"checked_at"`
}

type IDStaff struct {
	Matricule      string   `json:"matricule"`
	BirthDate      *string  `json:"birth_date"`
	Email          string   `json:"email"`
	Phone          string   `json:"phone"`
	AttendanceRate *float64 `json:"attendance_rate"`
	CurrentSession *Session `json:"current_session"`
}

// VerifyID sert la page ouverte en touchant la carte avec un téléphone.
func (a *App) VerifyID(ctx context.Context, p *Principal, cardURL, ip string) (IDResult, error) {
	if err := a.rateLimit(ctx, "verify:"+ip, 120, time.Minute); err != nil {
		return IDResult{}, err
	}
	t, err := a.resolveTap(ctx, TapInput{URL: cardURL}, true)
	st, _ := a.Settings(ctx)
	var state cardStateErr
	switch {
	case err == nil:
	case errors.As(err, &state):
		a.emitNow(ctx, events.New("card.blocked_presented", actor(p), t.card.StudentID, t.card.StudentID, map[string]any{"card_id": t.card.ID, "status": state.status, "ip": ip}))
		res := IDResult{Status: state.status, Message: state.Error()}
		if state.status == "inactif" {
			res.Status = "revoquee"
		}
		return res, nil
	case errors.Is(err, errCardReplay):
		a.emitNow(ctx, events.New("card.replay_detected", actor(p), t.card.StudentID, t.card.StudentID, map[string]any{"card_id": t.card.ID, "counter": t.counter, "ip": ip}))
		return IDResult{Status: "rejeu", Message: err.Error()}, nil
	case errors.Is(err, errCardUnknown):
		return IDResult{Status: "inconnue", Message: err.Error()}, nil
	default:
		var inv *Invalid
		if errors.Is(err, errCardForged) || errors.As(err, &inv) {
			return IDResult{Status: "invalide", Message: "carte non authentique"}, nil
		}
		return IDResult{}, err
	}
	a.recordCounter(ctx, t)
	res := IDResult{
		Status:  "valide",
		Message: "identité vérifiée",
		Student: &IDStudent{
			ID: t.student.ID, FullName: t.student.Name, ClassName: t.student.ClassName, FiliereName: t.student.Filiere,
			YearLabel: t.card.YearLabel, SchoolName: st.SchoolName, HasPhoto: t.student.HasPhoto, CheckedAt: a.Now(),
		},
		Proof: a.signToken("idproof", map[string]any{"c": t.card.ID, "s": t.student.ID}, 10*time.Minute),
	}
	var public bool
	var slug string
	if a.Pool.QueryRow(ctx, `SELECT profile_public, profile_slug FROM students WHERE user_id = $1`, t.student.ID).Scan(&public, &slug) == nil && public {
		res.Student.ProfileSlug = slug
	}
	if p.CanManageClass(t.student.ClassID) {
		staff := &IDStaff{Matricule: t.student.Matricule}
		a.Pool.QueryRow(ctx, `SELECT s.birth_date::text, u.email, u.phone FROM students s JOIN users u ON u.id = s.user_id WHERE s.user_id = $1`, t.student.ID).
			Scan(&staff.BirthDate, &staff.Email, &staff.Phone)
		if rate, err := a.studentRate(ctx, t.student.ID); err == nil {
			staff.AttendanceRate = rate
		}
		staff.CurrentSession, _ = a.CurrentSession(ctx, p, t.student.ClassID)
		res.Staff = staff
	}
	a.emitNow(ctx, events.New("card.verified", actor(p), t.student.ID, t.student.ID, map[string]any{"card_id": t.card.ID, "counter": t.counter, "ip": ip}))
	return res, nil
}

// recordCounter mémorise le dernier compteur vu, pour que l'anti-rejeu survive
// à une perte du cache.
func (a *App) recordCounter(ctx context.Context, t tapResult) {
	if t.card == nil || t.card.Kind != "sun" || t.counter == 0 {
		return
	}
	a.Pool.Exec(ctx, `UPDATE id_cards SET last_counter = $2 WHERE id = $1 AND last_counter < $2`, t.card.ID, t.counter)
}

func parseProof(c map[string]any) (cardID, studentID string) {
	cardID, _ = c["c"].(string)
	studentID, _ = c["s"].(string)
	return
}
