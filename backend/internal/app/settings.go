package app

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"edupilot/internal/events"
)

type Settings struct {
	SchoolName          string `json:"school_name"`
	LateMinutes         int    `json:"late_minutes"`
	AlertThreshold      int    `json:"alert_threshold"`
	WindowBeforeMinutes int    `json:"window_before_minutes"`
	WindowAfterMinutes  int    `json:"window_after_minutes"`
	DepartureMinMinutes int    `json:"departure_min_minutes"`
}

func defaultSettings() Settings {
	return Settings{
		SchoolName:          "Mon établissement",
		LateMinutes:         15,
		AlertThreshold:      3,
		WindowBeforeMinutes: 30,
		WindowAfterMinutes:  30,
		DepartureMinMinutes: 10,
	}
}

func (a *App) Settings(ctx context.Context) (Settings, error) {
	s := defaultSettings()
	if b, ok, _ := a.Cache.Get(ctx, "settings"); ok && json.Unmarshal(b, &s) == nil {
		return s, nil
	}
	var raw []byte
	err := a.Pool.QueryRow(ctx, `SELECT value FROM settings WHERE key = 'school'`).Scan(&raw)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return s, err
	}
	if raw != nil {
		json.Unmarshal(raw, &s)
	}
	if b, err := json.Marshal(s); err == nil {
		a.Cache.Set(ctx, "settings", b, time.Minute)
	}
	return s, nil
}

func (a *App) UpdateSettings(ctx context.Context, p *Principal, s Settings) (Settings, error) {
	if err := requireAdmin(p); err != nil {
		return s, err
	}
	s.SchoolName = strings.TrimSpace(s.SchoolName)
	switch {
	case s.SchoolName == "":
		return s, invalid("le nom de l'établissement est obligatoire")
	case s.LateMinutes < 0 || s.LateMinutes > 120:
		return s, invalid("le seuil de retard doit être entre 0 et 120 minutes")
	case s.AlertThreshold < 1 || s.AlertThreshold > 20:
		return s, invalid("le seuil d'alerte doit être entre 1 et 20 absences")
	case s.WindowBeforeMinutes < 0 || s.WindowBeforeMinutes > 180, s.WindowAfterMinutes < 0 || s.WindowAfterMinutes > 180:
		return s, invalid("la fenêtre de pointage doit être entre 0 et 180 minutes")
	case s.DepartureMinMinutes < 1 || s.DepartureMinMinutes > 240:
		return s, invalid("le délai minimal avant départ doit être entre 1 et 240 minutes")
	}
	raw, _ := json.Marshal(s)
	err := a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		_, err := tx.Exec(ctx, `INSERT INTO settings (key, value) VALUES ('school', $1)
			ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, raw)
		return []events.Event{ev(p, "settings.updated", "school", s)}, err
	})
	a.Cache.Del(ctx, "settings")
	return s, err
}
