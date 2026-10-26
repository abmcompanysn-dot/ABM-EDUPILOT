package events

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

// MemoryBus distribue les événements dans le processus. Chaque abonnement
// (groupe) reçoit tous les événements de ses topics, dans l'ordre de publication.
type MemoryBus struct {
	mu   sync.RWMutex
	subs []*memSub
}

type memSub struct {
	topics map[string]bool
	ch     chan Event
}

func NewMemory() *MemoryBus { return &MemoryBus{} }

func (b *MemoryBus) Publish(ctx context.Context, evs ...Event) error {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for _, e := range evs {
		t := TopicFor(e.Type)
		for _, s := range b.subs {
			if !s.topics[t] {
				continue
			}
			select {
			case s.ch <- e:
			case <-ctx.Done():
				return ctx.Err()
			}
		}
	}
	return nil
}

func (b *MemoryBus) Subscribe(ctx context.Context, o SubOpts, h Handler) error {
	s := &memSub{topics: map[string]bool{}, ch: make(chan Event, 1<<16)}
	for _, t := range o.Topics {
		s.topics[t] = true
	}
	b.mu.Lock()
	b.subs = append(b.subs, s)
	b.mu.Unlock()
	maxBatch, linger := normalize(o)
	go func() {
		for {
			var first Event
			select {
			case first = <-s.ch:
			case <-ctx.Done():
				return
			}
			batch := []Event{first}
			timer := time.NewTimer(linger)
		collect:
			for len(batch) < maxBatch {
				select {
				case e := <-s.ch:
					batch = append(batch, e)
				case <-timer.C:
					break collect
				}
			}
			timer.Stop()
			deliver(ctx, o.Group, h, batch)
		}
	}()
	return nil
}

func (b *MemoryBus) Close() error { return nil }

func normalize(o SubOpts) (int, time.Duration) {
	maxBatch, linger := o.MaxBatch, o.Linger
	if maxBatch <= 0 {
		maxBatch = 1
	}
	if linger <= 0 {
		linger = time.Millisecond
	}
	return maxBatch, linger
}

// deliver rejoue le lot jusqu'au succès (au moins une fois) avec un recul progressif.
func deliver(ctx context.Context, group string, h Handler, batch []Event) {
	backoff := 100 * time.Millisecond
	for {
		err := h(ctx, batch)
		if err == nil || ctx.Err() != nil {
			return
		}
		slog.Error("événements : échec du traitement, nouvel essai", "groupe", group, "lot", len(batch), "err", err)
		time.Sleep(backoff)
		if backoff < 5*time.Second {
			backoff *= 2
		}
	}
}
