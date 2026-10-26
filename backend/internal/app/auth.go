package app

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"edupilot/internal/events"
)

const (
	sessionTTL      = 30 * 24 * time.Hour
	principalTTL    = 30 * time.Second
	loginWindow     = 15 * time.Minute
	loginMaxPerIP   = 30
	loginMaxPerUser = 8
)

type LoginInput struct {
	Email     string `json:"email"`
	Password  string `json:"password"`
	IP        string `json:"-"`
	UserAgent string `json:"-"`
}

// Login vérifie les identifiants et ouvre une session ; le jeton n'est
// renvoyé qu'une fois, seule son empreinte est stockée.
func (a *App) Login(ctx context.Context, in LoginInput) (string, *Principal, error) {
	email := strings.ToLower(strings.TrimSpace(in.Email))
	if err := a.rateLimit(ctx, "login:ip:"+in.IP, loginMaxPerIP, loginWindow); err != nil {
		return "", nil, err
	}
	if err := a.rateLimit(ctx, "login:user:"+email, loginMaxPerUser, loginWindow); err != nil {
		return "", nil, err
	}
	var id, hash string
	var active bool
	err := a.Pool.QueryRow(ctx, `SELECT id, password_hash, active FROM users WHERE lower(email) = $1`, email).Scan(&id, &hash, &active)
	if errors.Is(err, pgx.ErrNoRows) {
		checkPassword(string(dummyHash), in.Password)
		return "", nil, invalid("email ou mot de passe incorrect")
	}
	if err != nil {
		return "", nil, err
	}
	if !checkPassword(hash, in.Password) || !active {
		a.emitNow(ctx, events.New("user.login_failed", "", id, id, map[string]any{"ip": in.IP}))
		return "", nil, invalid("email ou mot de passe incorrect")
	}
	token := base64.RawURLEncoding.EncodeToString(randomBytes(32))
	err = a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		if _, err := tx.Exec(ctx, `INSERT INTO auth_sessions (token_hash, user_id, expires_at, user_agent, ip) VALUES ($1, $2, $3, $4, $5)`,
			sha256Sum(token), id, a.Now().Add(sessionTTL), truncate(in.UserAgent, 300), in.IP); err != nil {
			return nil, err
		}
		if _, err := tx.Exec(ctx, `UPDATE users SET last_login_at = now() WHERE id = $1`, id); err != nil {
			return nil, err
		}
		return []events.Event{events.New("user.login", id, id, id, map[string]any{"ip": in.IP})}, nil
	})
	if err != nil {
		return "", nil, err
	}
	a.Cache.Del(ctx, "rl:login:user:"+email)
	p, err := a.Authenticate(ctx, token)
	return token, p, err
}

// Authenticate retrouve l'utilisateur d'une session, via le cache partagé.
func (a *App) Authenticate(ctx context.Context, token string) (*Principal, error) {
	if token == "" {
		return nil, ErrUnauthorized
	}
	key := "sess:" + hex.EncodeToString(sha256Sum(token))
	if b, ok, _ := a.Cache.Get(ctx, key); ok {
		var p Principal
		if json.Unmarshal(b, &p) == nil {
			return &p, nil
		}
	}
	var p Principal
	err := a.Pool.QueryRow(ctx, `
		SELECT u.id, u.role, u.full_name, u.email, u.must_change_password
		FROM auth_sessions s JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.active`,
		sha256Sum(token)).Scan(&p.UserID, &p.Role, &p.Name, &p.Email, &p.MustChangePassword)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrUnauthorized
	}
	if err != nil {
		return nil, err
	}
	if p.ClassIDs, err = a.classIDsOf(ctx, p.UserID, p.Role); err != nil {
		return nil, err
	}
	if b, err := json.Marshal(p); err == nil {
		a.Cache.Set(ctx, key, b, principalTTL)
	}
	return &p, nil
}

func (a *App) classIDsOf(ctx context.Context, userID, role string) ([]string, error) {
	var q string
	switch role {
	case RoleResponsable:
		q = `SELECT class_id::text FROM class_managers WHERE user_id = $1 ORDER BY class_id`
	case RoleStudent:
		q = `SELECT class_id::text FROM students WHERE user_id = $1`
	default:
		return []string{}, nil
	}
	rows, err := a.Pool.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if ids == nil {
		ids = []string{}
	}
	return ids, err
}

func (a *App) Logout(ctx context.Context, token string) error {
	h := sha256Sum(token)
	a.Cache.Del(ctx, "sess:"+hex.EncodeToString(h))
	_, err := a.Pool.Exec(ctx, `UPDATE auth_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, h)
	return err
}

// ChangePassword vérifie l'ancien mot de passe et ferme les autres sessions.
func (a *App) ChangePassword(ctx context.Context, p *Principal, token, current, next string) error {
	if err := validatePassword(next); err != nil {
		return err
	}
	var hash string
	if err := a.Pool.QueryRow(ctx, `SELECT password_hash FROM users WHERE id = $1`, p.UserID).Scan(&hash); err != nil {
		return err
	}
	if !checkPassword(hash, current) {
		return invalid("mot de passe actuel incorrect")
	}
	newHash, err := hashPassword(next)
	if err != nil {
		return err
	}
	err = a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		if _, err := tx.Exec(ctx, `UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1`, p.UserID, newHash); err != nil {
			return nil, err
		}
		if _, err := tx.Exec(ctx, `UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND token_hash <> $2 AND revoked_at IS NULL`,
			p.UserID, sha256Sum(token)); err != nil {
			return nil, err
		}
		return []events.Event{ev(p, "user.password_changed", p.UserID, nil)}, nil
	})
	if err == nil {
		a.Cache.Del(ctx, "sess:"+hex.EncodeToString(sha256Sum(token)))
	}
	return err
}

// rateLimit refuse au-delà de max tentatives par fenêtre glissante.
func (a *App) rateLimit(ctx context.Context, key string, max int, window time.Duration) error {
	n, err := a.Cache.Incr(ctx, "rl:"+key, window)
	if err != nil {
		slog.Warn("limitation : cache indisponible", "err", err)
		return nil
	}
	if n > int64(max) {
		return ErrRateLimited
	}
	return nil
}

// emitNow publie un événement hors transaction métier (via l'outbox, pour la durabilité).
func (a *App) emitNow(ctx context.Context, evs ...events.Event) {
	if err := a.inTx(ctx, func(pgx.Tx) ([]events.Event, error) { return evs, nil }); err != nil {
		slog.Error("événement non enregistré", "err", err)
	}
}

// BootstrapAdmin crée le premier compte admin s'il n'en existe aucun.
func (a *App) BootstrapAdmin(ctx context.Context, email, password string) error {
	var n int
	if err := a.Pool.QueryRow(ctx, `SELECT count(*) FROM users WHERE role = 'admin'`).Scan(&n); err != nil {
		return err
	}
	if n > 0 || email == "" {
		return nil
	}
	if err := validatePassword(password); err != nil {
		return err
	}
	hash, err := hashPassword(password)
	if err != nil {
		return err
	}
	_, err = a.Pool.Exec(ctx, `INSERT INTO users (role, email, password_hash, full_name) VALUES ('admin', $1, $2, 'Administrateur')`,
		strings.ToLower(strings.TrimSpace(email)), hash)
	if err == nil {
		slog.Info("compte administrateur initial créé", "email", email)
	}
	return err
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}
