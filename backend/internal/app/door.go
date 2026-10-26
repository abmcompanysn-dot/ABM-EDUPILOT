package app

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"edupilot/internal/events"
)

type Device struct {
	ID         string     `json:"id"`
	Name       string     `json:"name"`
	Location   string     `json:"location"`
	OpenMS     int        `json:"open_ms"`
	Active     bool       `json:"active"`
	CreatedAt  time.Time  `json:"created_at"`
	LastSeenAt *time.Time `json:"last_seen_at"`
	LastSyncAt *time.Time `json:"last_sync_at"`
}

func (a *App) ListDevices(ctx context.Context, p *Principal) ([]Device, error) {
	if err := requireAdmin(p); err != nil {
		return nil, err
	}
	rows, err := a.Pool.Query(ctx, `SELECT id, name, location, open_ms, active, created_at, last_seen_at, last_sync_at FROM devices ORDER BY name`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[Device])
}

type DeviceInput struct {
	Name     string `json:"name"`
	Location string `json:"location"`
	OpenMS   int    `json:"open_ms"`
	Active   *bool  `json:"active"`
}

// SaveDevice crée ou modifie une porte ; à la création (ou rotate=true) le
// secret partagé est renvoyé une seule fois.
func (a *App) SaveDevice(ctx context.Context, p *Principal, id string, in DeviceInput, rotate bool) (Device, string, error) {
	if err := requireAdmin(p); err != nil {
		return Device{}, "", err
	}
	if in.Name = strings.TrimSpace(in.Name); in.Name == "" {
		return Device{}, "", invalid("le nom de la porte est obligatoire")
	}
	if in.OpenMS == 0 {
		in.OpenMS = 5000
	}
	if in.OpenMS < 500 || in.OpenMS > 30000 {
		return Device{}, "", invalid("durée d'ouverture entre 500 et 30 000 ms")
	}
	var secret string
	var sealed []byte
	if id == "" || rotate {
		raw := randomBytes(32)
		secret = hex.EncodeToString(raw)
		var err error
		if sealed, err = a.seal(raw); err != nil {
			return Device{}, "", err
		}
	}
	err := a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		var err error
		if id == "" {
			err = tx.QueryRow(ctx, `INSERT INTO devices (name, location, secret_sealed, open_ms) VALUES ($1, $2, $3, $4) RETURNING id`,
				in.Name, strings.TrimSpace(in.Location), sealed, in.OpenMS).Scan(&id)
		} else {
			err = tx.QueryRow(ctx, `UPDATE devices SET name = $2, location = $3, open_ms = $4, active = COALESCE($5, active),
				secret_sealed = COALESCE($6, secret_sealed) WHERE id = $1 RETURNING id`, id, in.Name, strings.TrimSpace(in.Location), in.OpenMS, in.Active, sealed).Scan(&id)
		}
		if err != nil {
			return nil, mapPgErr(err, "")
		}
		return []events.Event{ev(p, "device.saved", id, map[string]any{"name": in.Name, "secret_rotated": secret != ""})}, nil
	})
	if err != nil {
		return Device{}, "", err
	}
	a.Cache.Del(ctx, "device:"+id)
	var d Device
	err = a.Pool.QueryRow(ctx, `SELECT id, name, location, open_ms, active, created_at, last_seen_at, last_sync_at FROM devices WHERE id = $1`, id).
		Scan(&d.ID, &d.Name, &d.Location, &d.OpenMS, &d.Active, &d.CreatedAt, &d.LastSeenAt, &d.LastSyncAt)
	return d, secret, err
}

func (a *App) DeleteDevice(ctx context.Context, p *Principal, id string) error {
	if err := requireAdmin(p); err != nil {
		return err
	}
	a.Cache.Del(ctx, "device:"+id)
	return a.inTx(ctx, func(tx pgx.Tx) ([]events.Event, error) {
		tag, err := tx.Exec(ctx, `DELETE FROM devices WHERE id = $1`, id)
		if err == nil && tag.RowsAffected() == 0 {
			err = ErrNotFound
		}
		return []events.Event{ev(p, "device.deleted", id, nil)}, mapPgErr(err, "")
	})
}

type DoorEvent struct {
	ID          int64     `json:"id"`
	DeviceName  string    `json:"device_name"`
	CardUID     string    `json:"card_uid"`
	StudentName *string   `json:"student_name"`
	Allowed     bool      `json:"allowed"`
	Reason      string    `json:"reason"`
	At          time.Time `json:"at"`
	Offline     bool      `json:"offline"`
}

func (a *App) ListDoorEvents(ctx context.Context, p *Principal, limit int) ([]DoorEvent, error) {
	if err := requireAdmin(p); err != nil {
		return nil, err
	}
	rows, err := a.Pool.Query(ctx, `
		SELECT e.id, d.name, e.card_uid, u.full_name, e.allowed, e.reason, e.at, e.offline
		FROM door_events e JOIN devices d ON d.id = e.device_id LEFT JOIN users u ON u.id = e.student_id
		ORDER BY e.at DESC LIMIT $1`, clampLimit(limit, 200, 1000))
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowToStructByPos[DoorEvent])
}

// ---------------------------------------------------------------- accès porte

type DoorRequest struct {
	DeviceID string `json:"device_id"`
	TapInput
	TS    int64  `json:"ts"`
	Nonce string `json:"nonce"`
}

type DoorResponse struct {
	Allow  bool   `json:"allow"`
	OpenMS int    `json:"open_ms,omitempty"`
	Name   string `json:"name,omitempty"`
	Reason string `json:"reason,omitempty"`
	Nonce  string `json:"nonce"`
	Sig    string `json:"sig"`
}

var ErrBadSignature = errors.New("signature de l'appareil invalide")

type deviceCache struct {
	Secret string `json:"s"`
	OpenMS int    `json:"o"`
	Active bool   `json:"a"`
}

func (a *App) deviceSecret(ctx context.Context, id string) (deviceCache, error) {
	var dc deviceCache
	if b, ok, _ := a.Cache.Get(ctx, "device:"+id); ok && json.Unmarshal(b, &dc) == nil {
		return dc, nil
	}
	var sealed []byte
	if err := a.Pool.QueryRow(ctx, `SELECT secret_sealed, open_ms, active FROM devices WHERE id = $1`, id).Scan(&sealed, &dc.OpenMS, &dc.Active); err != nil {
		return dc, mapPgErr(err, "")
	}
	raw, err := a.open(sealed)
	if err != nil {
		return dc, err
	}
	dc.Secret = hex.EncodeToString(raw)
	if b, err := json.Marshal(dc); err == nil {
		a.Cache.Set(ctx, "device:"+id, b, 5*time.Minute)
	}
	return dc, nil
}

func hmacHex(secretHex string, msg []byte) string {
	key, _ := hex.DecodeString(secretHex)
	m := hmac.New(sha256.New, key)
	m.Write(msg)
	return hex.EncodeToString(m.Sum(nil))
}

// DoorAccess traite une demande d'ouverture signée par une porte ESP32. La
// réponse est signée à son tour : un faux serveur ne peut pas ouvrir la porte.
func (a *App) DoorAccess(ctx context.Context, body []byte, sig string) (DoorResponse, error) {
	var req DoorRequest
	if err := json.Unmarshal(body, &req); err != nil {
		return DoorResponse{}, invalid("requête de porte mal formée")
	}
	dc, err := a.verifyDevice(ctx, body, sig, req.DeviceID, req.TS, req.Nonce)
	if err != nil {
		return DoorResponse{}, err
	}
	now := a.Now()

	reply := func(allow bool, name, reason string) (DoorResponse, error) {
		r := DoorResponse{Allow: allow, Name: name, Reason: reason, Nonce: req.Nonce}
		flag := "0"
		if allow {
			flag, r.OpenMS = "1", dc.OpenMS
		}
		r.Sig = hmacHex(dc.Secret, []byte(flag+"|"+req.Nonce))
		return r, nil
	}
	logEvent := func(uid, studentID string, allowed bool, reason string) {
		var sid any
		if studentID != "" {
			sid = studentID
		}
		a.Pool.Exec(ctx, `INSERT INTO door_events (device_id, card_uid, student_id, allowed, reason) VALUES ($1, $2, $3, $4, $5)`,
			req.DeviceID, uid, sid, allowed, reason)
		typ := "door.denied"
		if allowed {
			typ = "door.opened"
		}
		a.Bus.Publish(ctx, events.New(typ, "", studentID, req.DeviceID, map[string]any{"device_id": req.DeviceID, "card_uid": uid, "reason": reason}))
	}
	if !dc.Active {
		logEvent(req.UID, "", false, "porte désactivée")
		return reply(false, "", "porte désactivée")
	}
	t, err := a.resolveTap(ctx, req.TapInput, true)
	if err != nil {
		uid, studentID := req.UID, ""
		if t.card != nil {
			uid, studentID = t.card.UID, t.card.StudentID
		}
		var inv *Invalid
		var state cardStateErr
		if errors.As(err, &inv) || errors.As(err, &state) || errors.Is(err, errCardUnknown) || errors.Is(err, errCardReplay) || errors.Is(err, errCardForged) {
			logEvent(uid, studentID, false, err.Error())
			return reply(false, "", err.Error())
		}
		return DoorResponse{}, err
	}
	snap, err := a.Dir.get(ctx)
	if err != nil {
		return DoorResponse{}, err
	}
	st, _ := a.Settings(ctx)
	se := snap.currentSession(t.student.ClassID, now, minutes(st.WindowBeforeMinutes), 0)
	if se == nil {
		logEvent(t.card.UID, t.student.ID, false, "aucun cours en ce moment")
		return reply(false, t.student.Name, "aucun cours en ce moment")
	}
	data := ScanData{
		SessionID: se.ID, ClassID: se.ClassID, StudentID: t.student.ID, StudentName: t.student.Name,
		CardID: t.card.ID, Counter: t.counter, Kind: "arrivee", Status: "present", Method: "porte", At: now,
	}
	if now.After(se.Starts.Add(minutes(st.LateMinutes))) {
		data.Status = "retard"
	}
	if ok, _ := a.Cache.SetNX(ctx, scanKey(se.ID, t.student.ID), []byte(itoa64(now.Unix())), 18*time.Hour); ok {
		if err := a.Bus.Publish(ctx, events.New("scan.received", "", t.student.ID, se.ID, data)); err != nil {
			a.Cache.Del(ctx, scanKey(se.ID, t.student.ID))
			return DoorResponse{}, err
		}
	}
	logEvent(t.card.UID, t.student.ID, true, "cours : "+se.ModuleName)
	return reply(true, t.student.Name, "")
}

func itoa64(n int64) string {
	b, _ := json.Marshal(n)
	return string(b)
}

// verifyDevice authentifie une requête de porte : signature HMAC du corps,
// horloge à moins d'une minute, nonce jamais vu (anti-rejeu).
func (a *App) verifyDevice(ctx context.Context, body []byte, sig, deviceID string, ts int64, nonce string) (deviceCache, error) {
	if deviceID == "" || nonce == "" {
		return deviceCache{}, invalid("requête de porte mal formée")
	}
	dc, err := a.deviceSecret(ctx, deviceID)
	if err != nil {
		return dc, ErrBadSignature
	}
	if !hmac.Equal([]byte(strings.ToLower(sig)), []byte(hmacHex(dc.Secret, body))) {
		return dc, ErrBadSignature
	}
	if d := a.Now().Sub(time.Unix(ts, 0)); d > time.Minute || d < -time.Minute {
		return dc, invalid("horloge de la porte décalée de plus d'une minute")
	}
	tag, err := a.Pool.Exec(ctx, `INSERT INTO device_nonces (device_id, nonce) VALUES ($1, $2) ON CONFLICT DO NOTHING`, deviceID, truncate(nonce, 64))
	if err != nil {
		return dc, err
	}
	if tag.RowsAffected() == 0 {
		return dc, ErrBadSignature
	}
	a.Pool.Exec(ctx, `UPDATE devices SET last_seen_at = now() WHERE id = $1`, deviceID)
	return dc, nil
}
