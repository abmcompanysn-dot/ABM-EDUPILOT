// Package events définit les événements métier et le bus qui les transporte
// (Kafka en production, en mémoire en développement).
package events

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	TopicScans      = "edupilot.scans"
	TopicAttendance = "edupilot.attendance"
	TopicIdentity   = "edupilot.identity"
	TopicAcademic   = "edupilot.academic"
	TopicAccess     = "edupilot.access"
	TopicMessaging  = "edupilot.messaging"
)

var AllTopics = []string{TopicScans, TopicAttendance, TopicIdentity, TopicAcademic, TopicAccess, TopicMessaging}

// Event est l'enveloppe commune à tous les événements.
type Event struct {
	ID         string          `json:"id"`
	Type       string          `json:"type"`
	OccurredAt time.Time       `json:"occurred_at"`
	ActorID    string          `json:"actor_id,omitempty"`
	Subject    string          `json:"subject,omitempty"`
	Key        string          `json:"-"`
	Data       json.RawMessage `json:"data"`
}

// New construit un événement ; key fixe la partition Kafka (ordre garanti par clé).
func New(typ, actor, subject, key string, data any) Event {
	raw, err := json.Marshal(data)
	if err != nil {
		panic(fmt.Sprintf("events: données non sérialisables pour %s : %v", typ, err))
	}
	if key == "" {
		key = subject
	}
	return Event{ID: newUUID(), Type: typ, OccurredAt: time.Now().UTC(), ActorID: actor, Subject: subject, Key: key, Data: raw}
}

// TopicFor range un type d'événement dans son topic selon son préfixe.
func TopicFor(typ string) string {
	switch strings.SplitN(typ, ".", 2)[0] {
	case "scan":
		return TopicScans
	case "attendance", "absence":
		return TopicAttendance
	case "user", "student", "card", "photo":
		return TopicIdentity
	case "door", "device":
		return TopicAccess
	case "announcement", "notification", "feedback":
		return TopicMessaging
	default:
		return TopicAcademic
	}
}

type Handler func(ctx context.Context, batch []Event) error

type SubOpts struct {
	Group    string
	Topics   []string
	MaxBatch int
	Linger   time.Duration
	// FromLatest ignore l'historique (diffusion temps réel par instance).
	FromLatest bool
}

type Bus interface {
	Publish(ctx context.Context, evs ...Event) error
	// Subscribe démarre une consommation en arrière-plan jusqu'à l'annulation de ctx.
	Subscribe(ctx context.Context, opts SubOpts, h Handler) error
	Close() error
}

// Emit écrit les événements dans l'outbox, dans la transaction de la donnée.
func Emit(ctx context.Context, tx pgx.Tx, evs ...Event) error {
	for _, e := range evs {
		payload, err := json.Marshal(e)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO outbox (event_id, topic, key, payload) VALUES ($1, $2, $3, $4)`,
			e.ID, TopicFor(e.Type), e.Key, payload); err != nil {
			return err
		}
	}
	return nil
}

func newUUID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	b[6] = b[6]&0x0f | 0x40
	b[8] = b[8]&0x3f | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}
