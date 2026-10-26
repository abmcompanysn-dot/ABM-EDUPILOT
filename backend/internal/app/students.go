package app

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"edupilot/internal/events"
)

type Student struct {
	ID            string     `json:"id"`
	FullName      string     `json:"full_name"`
	Email         string     `json:"email"`
	Phone         string     `json:"phone"`
	Matricule     string     `json:"matricule"`
	ClassID       string     `json:"class_id"`
	ClassName     string     `json:"class_name"`
	FiliereName   string     `json:"filiere_name"`
	BirthDate     *string    `json:"birth_date"`
	Active        bool       `json:"active"`
	EnrolledAt    time.Time  `json:"enrolled_at"`
	HasPhoto      bool       `json:"has_photo"`
	ProfileSlug   string     `json:"profile_slug"`
	ProfilePublic bool       `json:"profile_public"`
	CardStatus    *string    `json:"card_status"`
	CardKind      *string    `json:"card_kind"`
	LastLoginAt   *time.Time `json:"last_login_at"`
}

const studentSelect = `
	SELECT u.id, u.full_name, u.email, u.phone, s.matricule, s.class_id, c.name, f.name, s.birth_date::text, u.active,
	       s.enrolled_at, s.photo IS NOT NULL, s.profile_slug, s.profile_public, k.status, k.kind, u.last_login_at
	FROM students s
	JOIN users u ON u.id = s.user_id
	JOIN classes c ON c.id = s.class_id
	JOIN filieres f ON f.id = c.filiere_id
	LEFT JOIN id_cards k ON k.student_id = s.user_id AND k.status = 'active'`

func (a *App) ListStudents(ctx context.Context, p *Principal, classID, q string) ([]Student, error) {
	if !p.IsStaff() {
		return nil, ErrForbidden
	}
	if classID != "" {
		if err := requireClass(p, classID); err != nil {
			return nil, err
		}
	}
	where, args := []string{"true"}, []any{}
	if classID != "" {
		args = append(args, classID)
		where = append(where, fmt.Sprintf("s.class_id = $%d", len(args)))
	} else if !p.IsAdmin() {
		args = append(args, p.ClassIDs)
		where = append(where, fmt.Sprintf("s.class_id::text = ANY($%d)", len(args)))
	}
	if q = strings.TrimSpace(q); q != "" {
		args = append(args, "%"+strings.ToLower(q)+"%")
		where = append(where, fmt.Sprintf("(lower(u.full_name) LIKE $%[1]d OR lower(s.matricule) LIKE $%[1]d OR lower(u.email) LIKE $%[1]d)", len(args)))
	}
	rows, err := a.Pool.Query(ctx, studentSelect+" WHERE "+strings.Join(where, " AND ")+" ORDER BY u.full_name LIMIT 2000", args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Student])
}

func (a *App) GetStudent(ctx context.Context, p *Principal, id string) (Student, error) {
	rows, err := a.Pool.Query(ctx, studentSelect+` WHERE s.user_id = $1`, id)
	if err != nil {
		return Student{}, err
	}
	st, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByPos[Student])
	if err != nil {
		return st, mapPgErr(err, "")
	}
	if p.UserID != id && !p.CanManageClass(st.ClassID) {
		return Student{}, ErrForbidden
	}
	return st, nil
}

type StudentInput struct {
	FullName  string  `json:"full_name"`
	Email     string  `json:"email"`
	Phone     string  `json:"phone"`
	Matricule string  `json:"matricule"`
	ClassID   string  `json:"class_id"`
	BirthDate *string `json:"birth_date"`
	Active    *bool   `json:"active"`
	Password  string  `json:"password,omitempty"`
}

func (in *StudentInput) normalize() error {
	in.FullName = strings.Join(strings.Fields(in.FullName), " ")
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	in.Phone = strings.TrimSpace(in.Phone)
	in.Matricule = strings.ToUpper(strings.TrimSpace(in.Matricule))
	if in.BirthDate != nil && *in.BirthDate == "" {
		in.BirthDate = nil
	}
	switch {
	case in.FullName == "":
		return invalid("le nom complet est obligatoire")
	case !strings.Contains(in.Email, "@"):
		return invalid("adresse email invalide")
	case in.Matricule == "":
		return invalid("le matricule est obligatoire")
	case in.ClassID == "":
		return invalid("la classe est obligatoire")
	}
	if in.BirthDate != nil {
		if _, err := time.Parse(time.DateOnly, *in.BirthDate); err != nil {
			return invalid("date de naissance invalide (AAAA-MM-JJ)")
		}
	}
	return nil
}

// insertStudent crée l'utilisateur et sa fiche étudiant dans tx.
func insertStudent(ctx context.Context, tx pgx.Tx, in StudentInput, hash string, mustChange bool) (string, error) {
	var id string
	if err := tx.QueryRow(ctx, `INSERT INTO users (role, email, password_hash, full_name, phone, must_change_password) VALUES ('etudiant', $1, $2, $3, $4, $5) RETURNING id`,
		in.Email, hash, in.FullName, in.Phone, mustChange).Scan(&id); err != nil {
		return "", mapPgErr(err, "cet email est déjà utilisé")
	}
	if _, err := tx.Exec(ctx, `INSERT INTO students (user_id, matricule, class_id, birth_date, profile_slug) VALUES ($1, $2, $3, $4, $5)`,
		id, in.Matricule, in.ClassID, in.BirthDate, randomSlug()); err != nil {
		return "", mapPgErr(err, "ce matricule est déjà utilisé")
	}
	return id, nil
}

// CreateStudent : par l'admin ou le responsable de la classe ; renvoie le mot de passe provisoire.
func (a *App) CreateStudent(ctx context.Context, p *Principal, in StudentInput) (Student, string, error) {
	if err := in.normalize(); err != nil {
		return Student{}, "", err
	}
	if err := requireClass(p, in.ClassID); err != nil {
		return Student{}, "", err
	}
	pw := tempPassword()
	hash, err := hashPassword(pw)
	if err != nil {
		return Student{}, "", err
	}
	var id string
	err = a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		var err error
		if id, err = insertStudent(ctx, tx, in, hash, true); err != nil {
			return nil, err
		}
		return []events.Event{ev(p, "student.enrolled", id, map[string]any{"matricule": in.Matricule, "class_id": in.ClassID})}, nil
	})
	if err != nil {
		return Student{}, "", err
	}
	a.Dir.Invalidate()
	st, err := a.GetStudent(ctx, p, id)
	return st, pw, err
}

type RegisterInput struct {
	InviteCode string `json:"invite_code"`
	StudentInput
}

// Register : auto-inscription d'un étudiant avec le code d'invitation de sa classe.
func (a *App) Register(ctx context.Context, in RegisterInput, ip string) (string, error) {
	if err := a.rateLimit(ctx, "register:"+ip, 10, time.Hour); err != nil {
		return "", err
	}
	_, classID, err := a.ClassByInvite(ctx, in.InviteCode)
	if err != nil {
		return "", err
	}
	in.ClassID = classID
	if err := in.normalize(); err != nil {
		return "", err
	}
	if err := validatePassword(in.Password); err != nil {
		return "", err
	}
	hash, err := hashPassword(in.Password)
	if err != nil {
		return "", err
	}
	var id string
	err = a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		var err error
		if id, err = insertStudent(ctx, tx, in.StudentInput, hash, false); err != nil {
			return nil, err
		}
		return []events.Event{events.New("student.registered", id, id, id, map[string]any{"matricule": in.Matricule, "class_id": classID})}, nil
	})
	a.Dir.Invalidate()
	return id, err
}

func (a *App) UpdateStudent(ctx context.Context, p *Principal, id string, in StudentInput) (Student, error) {
	cur, err := a.GetStudent(ctx, p, id)
	if err != nil {
		return cur, err
	}
	if !p.IsStaff() {
		return cur, ErrForbidden
	}
	if in.ClassID == "" {
		in.ClassID = cur.ClassID
	}
	if err := in.normalize(); err != nil {
		return cur, err
	}
	// Un responsable ne peut pas déplacer un étudiant vers une classe qu'il ne gère pas.
	if err := requireClass(p, in.ClassID); err != nil {
		return cur, err
	}
	err = a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		if _, err := tx.Exec(ctx, `UPDATE users SET full_name = $2, email = $3, phone = $4, active = COALESCE($5, active) WHERE id = $1`,
			id, in.FullName, in.Email, in.Phone, in.Active); err != nil {
			return nil, mapPgErr(err, "cet email est déjà utilisé")
		}
		if _, err := tx.Exec(ctx, `UPDATE students SET matricule = $2, class_id = $3, birth_date = $4 WHERE user_id = $1`,
			id, in.Matricule, in.ClassID, in.BirthDate); err != nil {
			return nil, mapPgErr(err, "ce matricule est déjà utilisé")
		}
		if in.Active != nil && !*in.Active {
			if _, err := tx.Exec(ctx, `UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, id); err != nil {
				return nil, err
			}
		}
		in.Password = ""
		return []events.Event{ev(p, "student.updated", id, in)}, nil
	})
	if err != nil {
		return cur, err
	}
	a.Dir.Invalidate()
	return a.GetStudent(ctx, p, id)
}

type Credential struct {
	Matricule string `json:"matricule"`
	FullName  string `json:"full_name"`
	Email     string `json:"email"`
	Password  string `json:"password,omitempty"`
	Error     string `json:"error,omitempty"`
}

// ImportStudents inscrit une liste d'étudiants dans une classe ; chaque ligne
// est indépendante, une erreur n'annule pas les autres.
func (a *App) ImportStudents(ctx context.Context, p *Principal, classID string, rows []StudentInput) ([]Credential, error) {
	if err := requireClass(p, classID); err != nil {
		return nil, err
	}
	if len(rows) > 2000 {
		return nil, invalid("2 000 étudiants maximum par import")
	}
	out := make([]Credential, 0, len(rows))
	for _, in := range rows {
		in.ClassID = classID
		c := Credential{Matricule: in.Matricule, FullName: in.FullName, Email: in.Email}
		if err := in.normalize(); err != nil {
			c.Error = err.Error()
			out = append(out, c)
			continue
		}
		pw := tempPassword()
		hash, err := hashPassword(pw)
		if err != nil {
			return nil, err
		}
		err = a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
			id, err := insertStudent(ctx, tx, in, hash, true)
			if err != nil {
				return nil, err
			}
			return []events.Event{ev(p, "student.enrolled", id, map[string]any{"matricule": in.Matricule, "class_id": classID, "import": true})}, nil
		})
		if err != nil {
			c.Error = err.Error()
		} else {
			c.Password = pw
		}
		out = append(out, c)
	}
	a.Dir.Invalidate()
	return out, nil
}

// ---------------------------------------------------------------- photos

const maxPhotoBytes = 2 << 20

func checkPhoto(data []byte) (string, error) {
	if len(data) == 0 || len(data) > maxPhotoBytes {
		return "", invalid("la photo doit faire moins de 2 Mo")
	}
	ct := http.DetectContentType(data)
	switch ct {
	case "image/jpeg", "image/png", "image/webp":
		return ct, nil
	}
	return "", invalid("format de photo non accepté (JPEG, PNG ou WebP)")
}

// SetPhoto : l'admin pose directement la photo officielle.
func (a *App) SetPhoto(ctx context.Context, p *Principal, studentID string, data []byte) error {
	if err := requireAdmin(p); err != nil {
		return err
	}
	ct, err := checkPhoto(data)
	if err != nil {
		return err
	}
	err = a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		tag, err := tx.Exec(ctx, `UPDATE students SET photo = $2, photo_type = $3 WHERE user_id = $1`, studentID, data, ct)
		if err == nil && tag.RowsAffected() == 0 {
			err = ErrNotFound
		}
		return []events.Event{ev(p, "photo.set", studentID, nil)}, mapPgErr(err, "")
	})
	a.Dir.Invalidate()
	return err
}

// RequestPhoto : l'étudiant propose une photo, validée ensuite par l'admin.
func (a *App) RequestPhoto(ctx context.Context, p *Principal, data []byte) error {
	if p.Role != RoleStudent {
		return ErrForbidden
	}
	ct, err := checkPhoto(data)
	if err != nil {
		return err
	}
	return a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		if _, err := tx.Exec(ctx, `UPDATE photo_requests SET status = 'refusee', decided_at = now() WHERE student_id = $1 AND status = 'en_attente'`, p.UserID); err != nil {
			return nil, err
		}
		var id string
		if err := tx.QueryRow(ctx, `INSERT INTO photo_requests (student_id, photo, photo_type) VALUES ($1, $2, $3) RETURNING id`, p.UserID, data, ct).Scan(&id); err != nil {
			return nil, err
		}
		return []events.Event{ev(p, "photo.requested", p.UserID, map[string]any{"request_id": id})}, nil
	})
}

type PhotoRequest struct {
	ID         string    `json:"id"`
	StudentID  string    `json:"student_id"`
	FullName   string    `json:"full_name"`
	Matricule  string    `json:"matricule"`
	ClassName  string    `json:"class_name"`
	CreatedAt  time.Time `json:"created_at"`
	HasCurrent bool      `json:"has_current"`
}

func (a *App) ListPhotoRequests(ctx context.Context, p *Principal) ([]PhotoRequest, error) {
	if err := requireAdmin(p); err != nil {
		return nil, err
	}
	rows, err := a.Pool.Query(ctx, `
		SELECT r.id, r.student_id, u.full_name, s.matricule, c.name, r.created_at, s.photo IS NOT NULL
		FROM photo_requests r JOIN students s ON s.user_id = r.student_id JOIN users u ON u.id = s.user_id JOIN classes c ON c.id = s.class_id
		WHERE r.status = 'en_attente' ORDER BY r.created_at`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[PhotoRequest])
}

func (a *App) PhotoRequestImage(ctx context.Context, p *Principal, id string) ([]byte, string, error) {
	if err := requireAdmin(p); err != nil {
		return nil, "", err
	}
	var data []byte
	var ct string
	err := a.Pool.QueryRow(ctx, `SELECT photo, photo_type FROM photo_requests WHERE id = $1`, id).Scan(&data, &ct)
	return data, ct, mapPgErr(err, "")
}

func (a *App) DecidePhotoRequest(ctx context.Context, p *Principal, id string, approve bool) error {
	if err := requireAdmin(p); err != nil {
		return err
	}
	status := "refusee"
	if approve {
		status = "approuvee"
	}
	err := a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		var studentID string
		err := tx.QueryRow(ctx, `UPDATE photo_requests SET status = $2, decided_at = now(), decided_by = $3 WHERE id = $1 AND status = 'en_attente' RETURNING student_id`,
			id, status, p.UserID).Scan(&studentID)
		if err != nil {
			return nil, mapPgErr(err, "")
		}
		if approve {
			if _, err := tx.Exec(ctx, `UPDATE students s SET photo = r.photo, photo_type = r.photo_type FROM photo_requests r WHERE r.id = $1 AND s.user_id = r.student_id`, id); err != nil {
				return nil, err
			}
			tx.Exec(ctx, `INSERT INTO notifications (user_id, kind, title, body) VALUES ($1, 'photo', 'Photo validée', 'Votre nouvelle photo officielle a été validée.')`, studentID)
		} else {
			tx.Exec(ctx, `INSERT INTO notifications (user_id, kind, title, body) VALUES ($1, 'photo', 'Photo refusée', 'Votre photo n''a pas été validée. Envoyez une photo de face, nette et récente.')`, studentID)
		}
		return []events.Event{ev(p, "photo."+map[bool]string{true: "approved", false: "rejected"}[approve], studentID, map[string]any{"request_id": id})}, nil
	})
	a.Dir.Invalidate()
	return err
}

// StudentPhoto renvoie la photo officielle : au personnel de la classe, à l'étudiant
// lui-même, ou à tout porteur d'une preuve de vérification de carte valide.
func (a *App) StudentPhoto(ctx context.Context, p *Principal, studentID, proof string) ([]byte, string, error) {
	allowed := p != nil && p.UserID == studentID
	if !allowed && proof != "" {
		if c, ok := a.verifyToken("idproof", proof); ok && c["s"] == studentID {
			allowed = true
		}
	}
	var data []byte
	var ct, classID string
	var public bool
	err := a.Pool.QueryRow(ctx, `SELECT photo, photo_type, class_id, profile_public FROM students WHERE user_id = $1`, studentID).Scan(&data, &ct, &classID, &public)
	if err != nil {
		return nil, "", mapPgErr(err, "")
	}
	if !allowed && !(p != nil && p.CanManageClass(classID)) {
		return nil, "", ErrForbidden
	}
	if data == nil {
		return nil, "", ErrNotFound
	}
	return data, ct, nil
}

// ---------------------------------------------------------------- profil pro

type Link struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}

type ProProfile struct {
	Slug        string   `json:"slug"`
	Public      bool     `json:"public"`
	FullName    string   `json:"full_name"`
	Headline    string   `json:"headline"`
	Bio         string   `json:"bio"`
	Skills      []string `json:"skills"`
	Links       []Link   `json:"links"`
	ClassName   string   `json:"class_name"`
	FiliereName string   `json:"filiere_name"`
	SchoolName  string   `json:"school_name"`
	Email       string   `json:"email,omitempty"`
	Phone       string   `json:"phone,omitempty"`
	HasPhoto    bool     `json:"has_photo"`
}

const profileSelect = `
	SELECT s.profile_slug, s.profile_public, u.full_name, s.headline, s.bio, s.skills, s.links, c.name, f.name, u.email, u.phone, s.photo IS NOT NULL
	FROM students s JOIN users u ON u.id = s.user_id JOIN classes c ON c.id = s.class_id JOIN filieres f ON f.id = c.filiere_id`

func (a *App) scanProfile(ctx context.Context, row pgx.Row) (ProProfile, error) {
	var pp ProProfile
	err := row.Scan(&pp.Slug, &pp.Public, &pp.FullName, &pp.Headline, &pp.Bio, &pp.Skills, &pp.Links, &pp.ClassName, &pp.FiliereName, &pp.Email, &pp.Phone, &pp.HasPhoto)
	if err != nil {
		return pp, mapPgErr(err, "")
	}
	s, err := a.Settings(ctx)
	pp.SchoolName = s.SchoolName
	return pp, err
}

func (a *App) MyProfile(ctx context.Context, p *Principal) (ProProfile, error) {
	if p.Role != RoleStudent {
		return ProProfile{}, ErrForbidden
	}
	return a.scanProfile(ctx, a.Pool.QueryRow(ctx, profileSelect+` WHERE s.user_id = $1`, p.UserID))
}

type ProfileInput struct {
	Headline string   `json:"headline"`
	Bio      string   `json:"bio"`
	Skills   []string `json:"skills"`
	Links    []Link   `json:"links"`
	Public   bool     `json:"public"`
	Phone    *string  `json:"phone"`
}

func (a *App) UpdateMyProfile(ctx context.Context, p *Principal, in ProfileInput) (ProProfile, error) {
	if p.Role != RoleStudent {
		return ProProfile{}, ErrForbidden
	}
	in.Headline = truncate(strings.TrimSpace(in.Headline), 120)
	in.Bio = truncate(strings.TrimSpace(in.Bio), 1200)
	skills := []string{}
	for _, s := range in.Skills {
		if s = truncate(strings.TrimSpace(s), 40); s != "" && len(skills) < 15 {
			skills = append(skills, s)
		}
	}
	links := []Link{}
	for _, l := range in.Links {
		u, err := url.Parse(strings.TrimSpace(l.URL))
		if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
			return ProProfile{}, invalid("lien invalide : %s (il doit commencer par https://)", l.URL)
		}
		if len(links) < 8 {
			links = append(links, Link{Label: truncate(strings.TrimSpace(l.Label), 40), URL: u.String()})
		}
	}
	err := a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		if _, err := tx.Exec(ctx, `UPDATE students SET headline = $2, bio = $3, skills = $4, links = $5, profile_public = $6 WHERE user_id = $1`,
			p.UserID, in.Headline, in.Bio, skills, links, in.Public); err != nil {
			return nil, err
		}
		if in.Phone != nil {
			if _, err := tx.Exec(ctx, `UPDATE users SET phone = $2 WHERE id = $1`, p.UserID, strings.TrimSpace(*in.Phone)); err != nil {
				return nil, err
			}
		}
		return []events.Event{ev(p, "student.profile_updated", p.UserID, map[string]any{"public": in.Public})}, nil
	})
	if err != nil {
		return ProProfile{}, err
	}
	return a.MyProfile(ctx, p)
}

// PublicProfile renvoie le profil pro partagé ; les coordonnées n'y figurent
// que si l'étudiant les a mises dans ses liens.
func (a *App) PublicProfile(ctx context.Context, slug string) (ProProfile, error) {
	pp, err := a.scanProfile(ctx, a.Pool.QueryRow(ctx, profileSelect+` WHERE s.profile_slug = $1`, slug))
	if err != nil {
		return pp, err
	}
	if !pp.Public {
		return ProProfile{}, ErrNotFound
	}
	pp.Email, pp.Phone = "", ""
	return pp, nil
}

func (a *App) PublicProfilePhoto(ctx context.Context, slug string) ([]byte, string, error) {
	var data []byte
	var ct string
	err := a.Pool.QueryRow(ctx, `SELECT photo, photo_type FROM students WHERE profile_slug = $1 AND profile_public AND photo IS NOT NULL`, slug).Scan(&data, &ct)
	return data, ct, mapPgErr(err, "")
}

// VCard produit la fiche contact (.vcf) du profil pro public.
func (a *App) VCard(ctx context.Context, slug string) (string, error) {
	pp, err := a.PublicProfile(ctx, slug)
	if err != nil {
		return "", err
	}
	esc := func(s string) string {
		return strings.NewReplacer(`\`, `\\`, ";", `\;`, ",", `\,`, "\n", `\n`).Replace(s)
	}
	var b strings.Builder
	b.WriteString("BEGIN:VCARD\r\nVERSION:3.0\r\n")
	fmt.Fprintf(&b, "FN:%s\r\n", esc(pp.FullName))
	if pp.Headline != "" {
		fmt.Fprintf(&b, "TITLE:%s\r\n", esc(pp.Headline))
	}
	fmt.Fprintf(&b, "ORG:%s\r\n", esc(pp.SchoolName))
	fmt.Fprintf(&b, "URL:%s/p/%s\r\n", a.Cfg.PublicURL, pp.Slug)
	for _, l := range pp.Links {
		fmt.Fprintf(&b, "URL:%s\r\n", l.URL)
	}
	b.WriteString("END:VCARD\r\n")
	return b.String(), nil
}
