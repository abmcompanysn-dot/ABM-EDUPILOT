// Command server démarre EduPilote : l'API HTTP et/ou le worker d'événements.
//
//	EDUPILOT_ROLES=api,worker   les deux (défaut, obligatoire sans Kafka)
//	EDUPILOT_ROLES=api          instances d'API derrière le proxy (scalables)
//	EDUPILOT_ROLES=worker       écriture des scans, journal, alertes
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "time/tzdata"

	"edupilot/internal/api"
	"edupilot/internal/app"
	"edupilot/internal/cache"
	"edupilot/internal/config"
	"edupilot/internal/db"
	"edupilot/internal/demo"
	"edupilot/internal/devpg"
	"edupilot/internal/events"
	"edupilot/internal/realtime"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))
	if err := run(); err != nil {
		slog.Error("arrêt sur erreur", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if cfg.DevPGDir != "" {
		slog.Warn("PostgreSQL embarqué (développement uniquement)", "dir", cfg.DevPGDir)
		pg, err := devpg.Start(cfg.DevPGDir)
		if err != nil {
			return err
		}
		defer pg.Stop()
		cfg.DatabaseURL = pg.URL
	}
	pool, err := db.Open(ctx, cfg.DatabaseURL, cfg.DBMaxConns)
	if err != nil {
		return err
	}
	defer pool.Close()
	if err := db.Migrate(ctx, pool); err != nil {
		return err
	}

	var store cache.Store
	if cfg.RedisURL != "" {
		r, err := cache.NewRedis(ctx, cfg.RedisURL)
		if err != nil {
			return err
		}
		store = r
		slog.Info("cache : Redis")
	} else {
		store = cache.NewMemory()
		slog.Warn("cache en mémoire : une seule instance d'API possible")
	}
	defer store.Close()

	var bus events.Bus
	if len(cfg.KafkaBrokers) > 0 {
		k, err := events.NewKafka(ctx, cfg.KafkaBrokers, cfg.KafkaPartitions)
		if err != nil {
			return err
		}
		bus = k
		slog.Info("bus d'événements : Kafka", "brokers", cfg.KafkaBrokers)
	} else {
		bus = events.NewMemory()
		slog.Warn("bus d'événements en mémoire (développement)")
	}
	defer bus.Close()

	a := app.New(pool, bus, store, cfg)
	if os.Getenv("EDUPILOT_DEMO_SEED") == "1" {
		if err := demo.Seed(ctx, pool, cfg.Location); err != nil {
			return err
		}
	}
	if err := a.BootstrapAdmin(ctx, cfg.BootstrapAdminEmail, cfg.BootstrapAdminPassword); err != nil {
		return err
	}

	if cfg.Roles["worker"] {
		if err := startWorker(ctx, a); err != nil {
			return err
		}
	}
	if !cfg.Roles["api"] {
		<-ctx.Done()
		return nil
	}

	hub := realtime.NewHub()
	// Chaque instance d'API lit le flux en direct (groupe propre) pour pousser
	// les présences à ses WebSockets et rafraîchir son annuaire en mémoire.
	instance := "api-" + hostname() + "-" + randomHex(4)
	err = bus.Subscribe(ctx, events.SubOpts{
		Group: instance, Topics: []string{events.TopicAttendance, events.TopicIdentity, events.TopicAcademic},
		MaxBatch: 200, Linger: 20 * time.Millisecond, FromLatest: true,
	}, func(ctx context.Context, batch []events.Event) error {
		for _, e := range batch {
			if events.TopicFor(e.Type) != events.TopicAttendance {
				a.Dir.Invalidate()
				break
			}
		}
		return hub.Dispatch(ctx, batch)
	})
	if err != nil {
		return err
	}

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           api.New(a, hub),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	errCh := make(chan error, 1)
	go func() {
		slog.Info("API à l'écoute", "addr", cfg.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()
	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return srv.Shutdown(shutdown)
}

func startWorker(ctx context.Context, a *app.App) error {
	go (&events.Relay{Pool: a.Pool, Bus: a.Bus}).Run(ctx)
	if err := a.Bus.Subscribe(ctx, events.SubOpts{
		Group: "scan-writer", Topics: []string{events.TopicScans}, MaxBatch: 500, Linger: 50 * time.Millisecond,
	}, a.PersistScans); err != nil {
		return err
	}
	if err := a.Bus.Subscribe(ctx, events.SubOpts{
		Group: "audit", Topics: events.AllTopics, MaxBatch: 500, Linger: 200 * time.Millisecond,
	}, a.ProjectAudit); err != nil {
		return err
	}
	go func() {
		tick := time.NewTicker(time.Minute)
		defer tick.Stop()
		last := time.Time{}
		for {
			if n, err := a.ProcessAbsences(ctx); err != nil {
				slog.Error("traitement des absences", "err", err)
			} else if n > 0 {
				slog.Info("cours traités pour les absences", "n", n)
			}
			if time.Since(last) > time.Hour {
				a.Housekeeping(ctx)
				last = time.Now()
			}
			select {
			case <-ctx.Done():
				return
			case <-tick.C:
			}
		}
	}()
	slog.Info("worker démarré")
	return nil
}

func hostname() string {
	h, _ := os.Hostname()
	if h == "" {
		return "local"
	}
	return h
}

func randomHex(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}
