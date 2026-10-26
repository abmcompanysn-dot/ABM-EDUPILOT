// Package app contient la logique métier d'EduPilote, indépendante du HTTP.
package app

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"edupilot/internal/cache"
	"edupilot/internal/config"
	"edupilot/internal/events"
	"edupilot/internal/sun"
)

type App struct {
	Pool  *pgxpool.Pool
	Bus   events.Bus
	Cache cache.Store
	Cfg   *config.Config
	Keys  sun.MasterKeys
	Dir   *Directory
	// Now est remplaçable dans les tests.
	Now func() time.Time
}

func New(pool *pgxpool.Pool, bus events.Bus, c cache.Store, cfg *config.Config) *App {
	a := &App{Pool: pool, Bus: bus, Cache: c, Cfg: cfg, Keys: sun.MasterKeys{Master: cfg.CardMasterKey}, Now: time.Now}
	a.Dir = newDirectory(a)
	return a
}

// ---------------------------------------------------------------- erreurs

var (
	ErrNotFound     = errors.New("introuvable")
	ErrForbidden    = errors.New("accès refusé")
	ErrUnauthorized = errors.New("authentification requise")
	ErrRateLimited  = errors.New("trop de tentatives, réessayez dans quelques minutes")
)

// Invalid signale une donnée refusée ; son message est montré à l'utilisateur.
type Invalid struct{ Msg string }

func (e *Invalid) Error() string { return e.Msg }

func invalid(format string, args ...any) error { return &Invalid{Msg: fmt.Sprintf(format, args...)} }

// Conflict signale une contrainte d'unicité (email, matricule…).
type Conflict struct{ Msg string }

func (e *Conflict) Error() string { return e.Msg }

// mapPgErr traduit les violations de contraintes en erreurs lisibles.
func mapPgErr(err error, uniqueMsg string) error {
	var pe *pgconn.PgError
	if errors.As(err, &pe) {
		switch pe.Code {
		case "23505":
			return &Conflict{Msg: uniqueMsg}
		case "23503":
			return invalid("élément lié introuvable ou encore utilisé")
		case "23514":
			return invalid("valeur refusée par les règles de cohérence")
		case "22P02":
			return ErrNotFound
		}
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

// ---------------------------------------------------------------- identité

const (
	RoleAdmin       = "admin"
	RoleResponsable = "responsable"
	RoleStudent     = "etudiant"
)

type Principal struct {
	UserID             string   `json:"id"`
	Role               string   `json:"role"`
	Name               string   `json:"full_name"`
	Email              string   `json:"email"`
	ClassIDs           []string `json:"class_ids"`
	MustChangePassword bool     `json:"must_change_password"`
}

func (p *Principal) IsAdmin() bool { return p != nil && p.Role == RoleAdmin }

func (p *Principal) IsStaff() bool {
	return p != nil && (p.Role == RoleAdmin || p.Role == RoleResponsable)
}

// CanManageClass : l'admin gère tout, un responsable ses seules classes.
func (p *Principal) CanManageClass(classID string) bool {
	return p.IsAdmin() || (p != nil && p.Role == RoleResponsable && slices.Contains(p.ClassIDs, classID))
}

func requireAdmin(p *Principal) error {
	if !p.IsAdmin() {
		return ErrForbidden
	}
	return nil
}

func requireClass(p *Principal, classID string) error {
	if !p.CanManageClass(classID) {
		return ErrForbidden
	}
	return nil
}

// ---------------------------------------------------------------- transactions

// inTx exécute fn dans une transaction puis écrit ses événements dans l'outbox.
func (a *App) inTx(ctx context.Context, fn func(tx pgx.Tx) ([]events.Event, error)) error {
	tx, err := a.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(context.Background())
	evs, err := fn(tx)
	if err != nil {
		return err
	}
	if err := events.Emit(ctx, tx, evs...); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func actor(p *Principal) string {
	if p == nil {
		return ""
	}
	return p.UserID
}

func ev(p *Principal, typ, subject string, data any) events.Event {
	return events.New(typ, actor(p), subject, subject, data)
}

// ---------------------------------------------------------------- utilitaires

func (a *App) today() time.Time {
	n := a.Now().In(a.Cfg.Location)
	return time.Date(n.Year(), n.Month(), n.Day(), 0, 0, 0, 0, a.Cfg.Location)
}

func clampLimit(n, def, max int) int {
	if n <= 0 {
		return def
	}
	return min(n, max)
}
