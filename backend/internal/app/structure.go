package app

import (
	"context"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"edupilot/internal/events"
)

// ---------------------------------------------------------------- années

type AcademicYear struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	StartsOn string `json:"starts_on"`
	EndsOn   string `json:"ends_on"`
	Active   bool   `json:"active"`
}

func (a *App) ListYears(ctx context.Context) ([]AcademicYear, error) {
	rows, err := a.Pool.Query(ctx, `SELECT id, label, starts_on::text, ends_on::text, active FROM academic_years ORDER BY starts_on DESC`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[AcademicYear])
}

func (a *App) SaveYear(ctx context.Context, p *Principal, y AcademicYear) (AcademicYear, error) {
	if err := requireAdmin(p); err != nil {
		return y, err
	}
	y.Label = strings.TrimSpace(y.Label)
	if y.Label == "" {
		return y, invalid("le libellé de l'année est obligatoire")
	}
	start, err1 := time.Parse(time.DateOnly, y.StartsOn)
	end, err2 := time.Parse(time.DateOnly, y.EndsOn)
	if err1 != nil || err2 != nil || !end.After(start) {
		return y, invalid("dates de début et de fin invalides")
	}
	err := a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		if y.Active {
			if _, err := tx.Exec(ctx, `UPDATE academic_years SET active = false WHERE active AND id::text <> $1`, y.ID); err != nil {
				return nil, err
			}
		}
		var err error
		if y.ID == "" {
			err = tx.QueryRow(ctx, `INSERT INTO academic_years (label, starts_on, ends_on, active) VALUES ($1, $2, $3, $4) RETURNING id`,
				y.Label, y.StartsOn, y.EndsOn, y.Active).Scan(&y.ID)
		} else {
			var tag interface{ RowsAffected() int64 }
			tag, err = tx.Exec(ctx, `UPDATE academic_years SET label = $2, starts_on = $3, ends_on = $4, active = $5 WHERE id = $1`,
				y.ID, y.Label, y.StartsOn, y.EndsOn, y.Active)
			if err == nil && tag.RowsAffected() == 0 {
				return nil, ErrNotFound
			}
		}
		if err != nil {
			return nil, mapPgErr(err, "une année porte déjà ce libellé")
		}
		return []events.Event{ev(p, "year.saved", y.ID, y)}, nil
	})
	a.Dir.Invalidate()
	return y, err
}

// ---------------------------------------------------------------- filières

type Filiere struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	ClassCount int    `json:"class_count"`
}

func (a *App) ListFilieres(ctx context.Context) ([]Filiere, error) {
	rows, err := a.Pool.Query(ctx, `
		SELECT f.id, f.name, count(c.id)::int FROM filieres f LEFT JOIN classes c ON c.filiere_id = f.id
		GROUP BY f.id ORDER BY f.name`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Filiere])
}

func (a *App) SaveFiliere(ctx context.Context, p *Principal, f Filiere) (Filiere, error) {
	if err := requireAdmin(p); err != nil {
		return f, err
	}
	if f.Name = strings.TrimSpace(f.Name); f.Name == "" {
		return f, invalid("le nom de la filière est obligatoire")
	}
	err := a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		var err error
		if f.ID == "" {
			err = tx.QueryRow(ctx, `INSERT INTO filieres (name) VALUES ($1) RETURNING id`, f.Name).Scan(&f.ID)
		} else {
			err = tx.QueryRow(ctx, `UPDATE filieres SET name = $2 WHERE id = $1 RETURNING id`, f.ID, f.Name).Scan(&f.ID)
		}
		if err != nil {
			return nil, mapPgErr(err, "une filière porte déjà ce nom")
		}
		return []events.Event{ev(p, "filiere.saved", f.ID, f)}, nil
	})
	return f, err
}

func (a *App) DeleteFiliere(ctx context.Context, p *Principal, id string) error {
	if err := requireAdmin(p); err != nil {
		return err
	}
	return a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		tag, err := tx.Exec(ctx, `DELETE FROM filieres WHERE id = $1`, id)
		if err != nil {
			return nil, invalid("supprimez d'abord les classes de cette filière")
		}
		if tag.RowsAffected() == 0 {
			return nil, ErrNotFound
		}
		return []events.Event{ev(p, "filiere.deleted", id, nil)}, nil
	})
}

// ---------------------------------------------------------------- classes

type UserRef struct {
	ID       string `json:"id"`
	FullName string `json:"full_name"`
}

type Class struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	FiliereID      string    `json:"filiere_id"`
	FiliereName    string    `json:"filiere_name"`
	AcademicYearID *string   `json:"academic_year_id"`
	YearLabel      *string   `json:"year_label"`
	InviteCode     string    `json:"invite_code"`
	InviteOpen     bool      `json:"invite_open"`
	StudentCount   int       `json:"student_count"`
	Managers       []UserRef `json:"managers"`
}

const classSelect = `
	SELECT c.id, c.name, c.filiere_id, f.name, c.academic_year_id::text, y.label, c.invite_code, c.invite_open,
	       (SELECT count(*) FROM students s WHERE s.class_id = c.id)::int,
	       COALESCE((SELECT json_agg(json_build_object('id', u.id, 'full_name', u.full_name) ORDER BY u.full_name)
	                 FROM class_managers m JOIN users u ON u.id = m.user_id WHERE m.class_id = c.id), '[]')
	FROM classes c JOIN filieres f ON f.id = c.filiere_id LEFT JOIN academic_years y ON y.id = c.academic_year_id`

func scanClass(row pgx.Row) (Class, error) {
	var c Class
	err := row.Scan(&c.ID, &c.Name, &c.FiliereID, &c.FiliereName, &c.AcademicYearID, &c.YearLabel, &c.InviteCode, &c.InviteOpen, &c.StudentCount, &c.Managers)
	return c, err
}

func (a *App) ListClasses(ctx context.Context, p *Principal) ([]Class, error) {
	q, args := classSelect+` ORDER BY f.name, c.name`, []any{}
	if !p.IsAdmin() {
		q, args = classSelect+` WHERE c.id::text = ANY($1) ORDER BY f.name, c.name`, []any{p.ClassIDs}
	}
	rows, err := a.Pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Class{}
	for rows.Next() {
		c, err := scanClass(rows)
		if err != nil {
			return nil, err
		}
		if !p.IsStaff() {
			c.InviteCode = ""
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (a *App) GetClass(ctx context.Context, p *Principal, id string) (Class, error) {
	if err := requireClass(p, id); err != nil {
		return Class{}, err
	}
	c, err := scanClass(a.Pool.QueryRow(ctx, classSelect+` WHERE c.id = $1`, id))
	return c, mapPgErr(err, "")
}

type ClassInput struct {
	Name           string  `json:"name"`
	FiliereID      string  `json:"filiere_id"`
	AcademicYearID *string `json:"academic_year_id"`
	InviteOpen     *bool   `json:"invite_open"`
}

func (a *App) SaveClass(ctx context.Context, p *Principal, id string, in ClassInput) (Class, error) {
	if err := requireAdmin(p); err != nil {
		return Class{}, err
	}
	if in.Name = strings.TrimSpace(in.Name); in.Name == "" || in.FiliereID == "" {
		return Class{}, invalid("le nom et la filière de la classe sont obligatoires")
	}
	if in.AcademicYearID != nil && *in.AcademicYearID == "" {
		in.AcademicYearID = nil
	}
	open := in.InviteOpen == nil || *in.InviteOpen
	err := a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		var err error
		if id == "" {
			err = tx.QueryRow(ctx, `INSERT INTO classes (name, filiere_id, academic_year_id, invite_code, invite_open) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
				in.Name, in.FiliereID, in.AcademicYearID, randomCode(8), open).Scan(&id)
		} else {
			err = tx.QueryRow(ctx, `UPDATE classes SET name = $2, filiere_id = $3, academic_year_id = $4, invite_open = $5 WHERE id = $1 RETURNING id`,
				id, in.Name, in.FiliereID, in.AcademicYearID, open).Scan(&id)
		}
		if err != nil {
			return nil, mapPgErr(err, "cette filière a déjà une classe de ce nom")
		}
		return []events.Event{ev(p, "class.saved", id, in)}, nil
	})
	if err != nil {
		return Class{}, err
	}
	a.Dir.Invalidate()
	return a.GetClass(ctx, p, id)
}

func (a *App) DeleteClass(ctx context.Context, p *Principal, id string) error {
	if err := requireAdmin(p); err != nil {
		return err
	}
	err := a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		tag, err := tx.Exec(ctx, `DELETE FROM classes WHERE id = $1`, id)
		if err != nil {
			return nil, invalid("déplacez ou supprimez d'abord les étudiants de cette classe")
		}
		if tag.RowsAffected() == 0 {
			return nil, ErrNotFound
		}
		return []events.Event{ev(p, "class.deleted", id, nil)}, nil
	})
	a.Dir.Invalidate()
	return err
}

func (a *App) RegenerateInvite(ctx context.Context, p *Principal, id string) (Class, error) {
	if err := requireClass(p, id); err != nil {
		return Class{}, err
	}
	err := a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		tag, err := tx.Exec(ctx, `UPDATE classes SET invite_code = $2 WHERE id = $1`, id, randomCode(8))
		if err == nil && tag.RowsAffected() == 0 {
			err = ErrNotFound
		}
		return []events.Event{ev(p, "class.invite_regenerated", id, nil)}, err
	})
	if err != nil {
		return Class{}, err
	}
	return a.GetClass(ctx, p, id)
}

// SetManagers remplace la liste des responsables d'une classe.
func (a *App) SetManagers(ctx context.Context, p *Principal, classID string, userIDs []string) (Class, error) {
	if err := requireAdmin(p); err != nil {
		return Class{}, err
	}
	err := a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		if _, err := tx.Exec(ctx, `DELETE FROM class_managers WHERE class_id = $1`, classID); err != nil {
			return nil, err
		}
		if len(userIDs) > 0 {
			tag, err := tx.Exec(ctx, `INSERT INTO class_managers (class_id, user_id)
				SELECT $1, id FROM users WHERE id::text = ANY($2) AND role = 'responsable'`, classID, userIDs)
			if err != nil {
				return nil, mapPgErr(err, "")
			}
			if int(tag.RowsAffected()) != len(userIDs) {
				return nil, invalid("un des comptes choisis n'est pas un responsable")
			}
		}
		return []events.Event{ev(p, "class.managers_set", classID, map[string]any{"user_ids": userIDs})}, nil
	})
	if err != nil {
		return Class{}, err
	}
	return a.GetClass(ctx, p, classID)
}

type InviteInfo struct {
	ClassName   string `json:"class_name"`
	FiliereName string `json:"filiere_name"`
	SchoolName  string `json:"school_name"`
}

// ClassByInvite sert la page publique d'inscription.
func (a *App) ClassByInvite(ctx context.Context, code string) (InviteInfo, string, error) {
	var info InviteInfo
	var id string
	var open bool
	err := a.Pool.QueryRow(ctx, `SELECT c.id, c.name, f.name, c.invite_open FROM classes c JOIN filieres f ON f.id = c.filiere_id WHERE c.invite_code = $1`,
		strings.ToUpper(strings.TrimSpace(code))).Scan(&id, &info.ClassName, &info.FiliereName, &open)
	if err != nil {
		return info, "", mapPgErr(err, "")
	}
	if !open {
		return info, "", invalid("les inscriptions de cette classe sont fermées")
	}
	s, err := a.Settings(ctx)
	info.SchoolName = s.SchoolName
	return info, id, err
}

// ---------------------------------------------------------------- personnel

type User struct {
	ID          string     `json:"id"`
	Role        string     `json:"role"`
	Email       string     `json:"email"`
	FullName    string     `json:"full_name"`
	Phone       string     `json:"phone"`
	Active      bool       `json:"active"`
	LastLoginAt *time.Time `json:"last_login_at"`
	ClassIDs    []string   `json:"class_ids"`
}

func (a *App) ListStaff(ctx context.Context, p *Principal) ([]User, error) {
	if err := requireAdmin(p); err != nil {
		return nil, err
	}
	rows, err := a.Pool.Query(ctx, `
		SELECT u.id, u.role, u.email, u.full_name, u.phone, u.active, u.last_login_at,
		       COALESCE(array_agg(m.class_id::text) FILTER (WHERE m.class_id IS NOT NULL), '{}')
		FROM users u LEFT JOIN class_managers m ON m.user_id = u.id
		WHERE u.role IN ('admin', 'responsable') GROUP BY u.id ORDER BY u.role, u.full_name`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[User])
}

type StaffInput struct {
	Role     string   `json:"role"`
	Email    string   `json:"email"`
	FullName string   `json:"full_name"`
	Phone    string   `json:"phone"`
	Active   *bool    `json:"active"`
	ClassIDs []string `json:"class_ids"`
}

// CreateStaff crée un compte responsable ou admin et renvoie son mot de passe provisoire.
func (a *App) CreateStaff(ctx context.Context, p *Principal, in StaffInput) (User, string, error) {
	if err := requireAdmin(p); err != nil {
		return User{}, "", err
	}
	if in.Role != RoleResponsable && in.Role != RoleAdmin {
		return User{}, "", invalid("rôle inconnu")
	}
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if in.FullName = strings.TrimSpace(in.FullName); in.FullName == "" || !strings.Contains(in.Email, "@") {
		return User{}, "", invalid("nom et email valides obligatoires")
	}
	pw := tempPassword()
	hash, err := hashPassword(pw)
	if err != nil {
		return User{}, "", err
	}
	var id string
	err = a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		if err := tx.QueryRow(ctx, `INSERT INTO users (role, email, password_hash, full_name, phone, must_change_password) VALUES ($1, $2, $3, $4, $5, true) RETURNING id`,
			in.Role, in.Email, hash, in.FullName, strings.TrimSpace(in.Phone)).Scan(&id); err != nil {
			return nil, mapPgErr(err, "cet email est déjà utilisé")
		}
		if in.Role == RoleResponsable && len(in.ClassIDs) > 0 {
			if _, err := tx.Exec(ctx, `INSERT INTO class_managers (class_id, user_id) SELECT id, $1 FROM classes WHERE id::text = ANY($2)`, id, in.ClassIDs); err != nil {
				return nil, err
			}
		}
		return []events.Event{ev(p, "user.created", id, map[string]any{"role": in.Role, "email": in.Email})}, nil
	})
	if err != nil {
		return User{}, "", err
	}
	u, err := a.getUser(ctx, id)
	return u, pw, err
}

func (a *App) UpdateStaff(ctx context.Context, p *Principal, id string, in StaffInput) (User, error) {
	if err := requireAdmin(p); err != nil {
		return User{}, err
	}
	if id == p.UserID && in.Active != nil && !*in.Active {
		return User{}, invalid("vous ne pouvez pas désactiver votre propre compte")
	}
	err := a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		var role string
		err := tx.QueryRow(ctx, `UPDATE users SET full_name = COALESCE(NULLIF($2, ''), full_name), phone = $3, active = COALESCE($4, active)
			WHERE id = $1 AND role IN ('admin', 'responsable') RETURNING role`, id, strings.TrimSpace(in.FullName), strings.TrimSpace(in.Phone), in.Active).Scan(&role)
		if err != nil {
			return nil, mapPgErr(err, "")
		}
		if in.ClassIDs != nil && role == RoleResponsable {
			if _, err := tx.Exec(ctx, `DELETE FROM class_managers WHERE user_id = $1`, id); err != nil {
				return nil, err
			}
			if _, err := tx.Exec(ctx, `INSERT INTO class_managers (class_id, user_id) SELECT id, $1 FROM classes WHERE id::text = ANY($2)`, id, in.ClassIDs); err != nil {
				return nil, err
			}
		}
		if in.Active != nil && !*in.Active {
			if _, err := tx.Exec(ctx, `UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, id); err != nil {
				return nil, err
			}
		}
		return []events.Event{ev(p, "user.updated", id, in)}, nil
	})
	if err != nil {
		return User{}, err
	}
	return a.getUser(ctx, id)
}

// ResetPassword attribue un mot de passe provisoire et ferme les sessions ouvertes.
func (a *App) ResetPassword(ctx context.Context, p *Principal, id string) (string, error) {
	if err := requireAdmin(p); err != nil {
		return "", err
	}
	pw := tempPassword()
	hash, err := hashPassword(pw)
	if err != nil {
		return "", err
	}
	err = a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		tag, err := tx.Exec(ctx, `UPDATE users SET password_hash = $2, must_change_password = true WHERE id = $1`, id, hash)
		if err != nil {
			return nil, mapPgErr(err, "")
		}
		if tag.RowsAffected() == 0 {
			return nil, ErrNotFound
		}
		if _, err := tx.Exec(ctx, `UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, id); err != nil {
			return nil, err
		}
		return []events.Event{ev(p, "user.password_reset", id, nil)}, nil
	})
	return pw, err
}

func (a *App) getUser(ctx context.Context, id string) (User, error) {
	row := a.Pool.QueryRow(ctx, `
		SELECT u.id, u.role, u.email, u.full_name, u.phone, u.active, u.last_login_at,
		       COALESCE(array_agg(m.class_id::text) FILTER (WHERE m.class_id IS NOT NULL), '{}')
		FROM users u LEFT JOIN class_managers m ON m.user_id = u.id WHERE u.id = $1 GROUP BY u.id`, id)
	var u User
	err := row.Scan(&u.ID, &u.Role, &u.Email, &u.FullName, &u.Phone, &u.Active, &u.LastLoginAt, &u.ClassIDs)
	return u, mapPgErr(err, "")
}
