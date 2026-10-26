package events

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Relay publie les événements de l'outbox sur le bus. FOR UPDATE SKIP LOCKED
// permet de lancer plusieurs relais sans publier deux fois le même lot.
type Relay struct {
	Pool *pgxpool.Pool
	Bus  Bus
}

func (r *Relay) Run(ctx context.Context) {
	for ctx.Err() == nil {
		n, err := r.flush(ctx)
		if err != nil && ctx.Err() == nil {
			slog.Error("outbox : échec de publication", "err", err)
			time.Sleep(time.Second)
			continue
		}
		if n == 0 {
			select {
			case <-ctx.Done():
			case <-time.After(100 * time.Millisecond):
			}
		}
	}
}

func (r *Relay) flush(ctx context.Context) (int, error) {
	tx, err := r.Pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(context.Background())
	rows, err := tx.Query(ctx, `SELECT id, key, payload FROM outbox WHERE published_at IS NULL ORDER BY id LIMIT 500 FOR UPDATE SKIP LOCKED`)
	if err != nil {
		return 0, err
	}
	var ids []int64
	var evs []Event
	for rows.Next() {
		var id int64
		var key string
		var payload []byte
		if err := rows.Scan(&id, &key, &payload); err != nil {
			rows.Close()
			return 0, err
		}
		var e Event
		if err := json.Unmarshal(payload, &e); err != nil {
			rows.Close()
			return 0, err
		}
		e.Key = key
		ids = append(ids, id)
		evs = append(evs, e)
	}
	rows.Close()
	if len(evs) == 0 {
		return 0, nil
	}
	if err := r.Bus.Publish(ctx, evs...); err != nil {
		return 0, err
	}
	if _, err := tx.Exec(ctx, `UPDATE outbox SET published_at = now() WHERE id = ANY($1)`, ids); err != nil {
		return 0, err
	}
	return len(evs), tx.Commit(ctx)
}

// Prune supprime les événements publiés depuis plus de 7 jours.
func Prune(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, `DELETE FROM outbox WHERE published_at < now() - interval '7 days'`)
	return err
}
