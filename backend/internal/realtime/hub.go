// Package realtime pousse les présences aux écrans ouverts, par WebSocket.
package realtime

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"

	"edupilot/internal/events"
)

type Hub struct {
	mu      sync.RWMutex
	clients map[*client]struct{}
}

type client struct {
	all     bool
	classes map[string]bool
	send    chan []byte
}

func NewHub() *Hub { return &Hub{clients: map[*client]struct{}{}} }

// Message est ce que reçoit le navigateur.
type Message struct {
	Type string          `json:"type"`
	At   time.Time       `json:"at"`
	Data json.RawMessage `json:"data"`
}

// Dispatch transmet aux clients concernés les événements de présence d'un lot.
func (h *Hub) Dispatch(_ context.Context, batch []events.Event) error {
	for _, e := range batch {
		var meta struct {
			ClassID string `json:"class_id"`
		}
		if json.Unmarshal(e.Data, &meta) != nil || meta.ClassID == "" {
			continue
		}
		msg, _ := json.Marshal(Message{Type: e.Type, At: e.OccurredAt, Data: e.Data})
		h.mu.RLock()
		for c := range h.clients {
			if !c.all && !c.classes[meta.ClassID] {
				continue
			}
			select {
			case c.send <- msg:
			default: // client trop lent : on ne bloque pas les autres
			}
		}
		h.mu.RUnlock()
	}
	return nil
}

// Serve garde la connexion ouverte et y écrit les messages des classes autorisées.
func (h *Hub) Serve(w http.ResponseWriter, r *http.Request, all bool, classes []string) {
	conn, err := websocket.Accept(w, r, nil)
	if err != nil {
		return
	}
	defer conn.CloseNow()
	c := &client{all: all, classes: map[string]bool{}, send: make(chan []byte, 256)}
	for _, id := range classes {
		c.classes[id] = true
	}
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
	defer func() {
		h.mu.Lock()
		delete(h.clients, c)
		h.mu.Unlock()
	}()
	ctx := conn.CloseRead(r.Context())
	ping := time.NewTicker(25 * time.Second)
	defer ping.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case msg := <-c.send:
			wctx, cancel := context.WithTimeout(ctx, 5*time.Second)
			err := conn.Write(wctx, websocket.MessageText, msg)
			cancel()
			if err != nil {
				return
			}
		case <-ping.C:
			pctx, cancel := context.WithTimeout(ctx, 10*time.Second)
			err := conn.Ping(pctx)
			cancel()
			if err != nil {
				slog.Debug("websocket : client perdu", "err", err)
				return
			}
		}
	}
}

func (h *Hub) Count() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}
