package app

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"edupilot/internal/events"
	"edupilot/internal/sun"
)

// Mode hors ligne des portes : quand le réseau est fiable, la porte télécharge
// la liste des cartes actives et les cours proches ; pendant une coupure elle
// décide seule avec cette liste, puis remonte les passages à son retour.
// Limite assumée : sans réseau, la porte ne peut ni contrôler l'anti-rejeu des
// liens de carte ni apprendre qu'une carte vient d'être déclarée perdue.

const doorCacheValidity = 24 * time.Hour

type deviceHeader struct {
	DeviceID string `json:"device_id"`
	TS       int64  `json:"ts"`
	Nonce    string `json:"nonce"`
}

// DoorSync renvoie la liste à garder en mémoire, en texte compact (une ligne
// par carte) pour tenir dans la mémoire d'un ESP32, et sa signature HMAC.
//
//	EDUPILOT-SYNC 1
//	T <maintenant>            V <valide jusqu'à>     (horodatages Unix)
//	W <avance du pointage, s> <seuil de retard, s>
//	S <classe> <début> <fin> <cours>
//	C <UID> <classe>
func (a *App) DoorSync(ctx context.Context, body []byte, sig string) (string, string, error) {
	var h deviceHeader
	if err := json.Unmarshal(body, &h); err != nil {
		return "", "", invalid("requête de porte mal formée")
	}
	dc, err := a.verifyDevice(ctx, body, sig, h.DeviceID, h.TS, h.Nonce)
	if err != nil {
		return "", "", err
	}
	if !dc.Active {
		return "", "", invalid("porte désactivée")
	}
	snap, err := a.Dir.get(ctx)
	if err != nil {
		return "", "", err
	}
	st, err := a.Settings(ctx)
	if err != nil {
		return "", "", err
	}
	now := a.Now()
	var b strings.Builder
	b.WriteString("EDUPILOT-SYNC 1\n")
	fmt.Fprintf(&b, "T %d\nV %d\nW %d %d\n", now.Unix(), now.Add(doorCacheValidity).Unix(), st.WindowBeforeMinutes*60, st.LateMinutes*60)
	rows, err := a.Pool.Query(ctx, `
		SELECT class_id::text, starts_at, ends_at, id::text FROM course_sessions
		WHERE status <> 'annule' AND ends_at > $1 AND starts_at < $2 ORDER BY starts_at`, now.Add(-time.Hour), now.Add(doorCacheValidity+2*time.Hour))
	if err != nil {
		return "", "", err
	}
	for rows.Next() {
		var class, id string
		var s, e time.Time
		if err := rows.Scan(&class, &s, &e, &id); err != nil {
			rows.Close()
			return "", "", err
		}
		fmt.Fprintf(&b, "S %s %d %d %s\n", class, s.Unix(), e.Unix(), id)
	}
	rows.Close()
	today := a.today()
	for uid, c := range snap.cardsByUID {
		stu := snap.students[c.StudentID]
		if c.Status != "active" || stu == nil || !stu.Active || (c.YearEnds != nil && today.After(*c.YearEnds)) {
			continue
		}
		fmt.Fprintf(&b, "C %s %s\n", uid, stu.ClassID)
	}
	out := b.String()
	a.Pool.Exec(ctx, `UPDATE devices SET last_sync_at = now() WHERE id = $1`, h.DeviceID)
	return out, hmacHex(dc.Secret, []byte(out)), nil
}

type OfflineEvent struct {
	ID        string `json:"id"`
	UID       string `json:"uid"`
	URL       string `json:"url"`
	At        int64  `json:"at"`
	Allowed   bool   `json:"allowed"`
	Reason    string `json:"reason"`
	SessionID string `json:"session_id"`
}

type OfflineResult struct {
	Accepted   int `json:"accepted"`
	Duplicates int `json:"duplicates"`
}

// DoorOfflineEvents enregistre les passages décidés pendant une coupure. Un
// passage autorisé devient une présence (méthode « porte ») à l'heure réelle du
// passage ; un lien de carte non authentique est signalé et n'est pas compté.
func (a *App) DoorOfflineEvents(ctx context.Context, body []byte, sig string) (OfflineResult, error) {
	var req struct {
		deviceHeader
		Events []OfflineEvent `json:"events"`
	}
	var res OfflineResult
	if err := json.Unmarshal(body, &req); err != nil {
		return res, invalid("requête de porte mal formée")
	}
	if _, err := a.verifyDevice(ctx, body, sig, req.DeviceID, req.TS, req.Nonce); err != nil {
		return res, err
	}
	if len(req.Events) > 200 {
		return res, invalid("200 passages au maximum par envoi")
	}
	snap, err := a.Dir.get(ctx)
	if err != nil {
		return res, err
	}
	st, err := a.Settings(ctx)
	if err != nil {
		return res, err
	}
	now := a.Now()
	for _, e := range req.Events {
		at := time.Unix(e.At, 0)
		if e.ID == "" || at.After(now.Add(time.Minute)) || at.Before(now.Add(-7*24*time.Hour)) {
			continue
		}
		uid, _ := NormalizeUID(e.UID)
		allowed, reason := e.Allowed, truncate(e.Reason, 200)
		var studentID string
		var card *dirCard
		counter := 0
		if card = snap.cardsByUID[uid]; card != nil {
			studentID = card.StudentID
		}
		// Contrôle a posteriori du lien signé : un clone de carte se révèle ici.
		if ec, cc := sunParams(e.URL); ec != "" {
			tap, err := sun.Verify(a.Keys, ec, cc)
			if err != nil || tap.UID != uid {
				allowed, reason = false, "lien de carte non authentique (détecté après coupure)"
				a.Bus.Publish(ctx, events.New("card.rejected_scan", "", studentID, req.DeviceID, map[string]any{"device_id": req.DeviceID, "uid": uid, "offline": true}))
			} else {
				counter = tap.Counter
			}
		}
		var sid any
		if studentID != "" {
			sid = studentID
		}
		tag, err := a.Pool.Exec(ctx, `
			INSERT INTO door_events (device_id, client_event_id, card_uid, student_id, allowed, reason, at, offline)
			VALUES ($1, $2, $3, $4, $5, $6, $7, true) ON CONFLICT DO NOTHING`,
			req.DeviceID, truncate(e.ID, 64), uid, sid, allowed, reason, at)
		if err != nil {
			return res, err
		}
		if tag.RowsAffected() == 0 {
			res.Duplicates++
			continue
		}
		res.Accepted++
		typ := "door.denied"
		if allowed {
			typ = "door.opened"
		}
		a.Bus.Publish(ctx, events.New(typ, "", studentID, req.DeviceID, map[string]any{"device_id": req.DeviceID, "card_uid": uid, "reason": reason, "offline": true, "at": at}))
		if !allowed || card == nil || e.SessionID == "" {
			continue
		}
		stu := snap.students[studentID]
		se, err := a.Dir.session(ctx, snap, e.SessionID)
		if err != nil || stu == nil || se.ClassID != stu.ClassID || se.Status == "annule" {
			continue
		}
		if at.Before(se.Starts.Add(-minutes(st.WindowBeforeMinutes))) || at.After(se.Ends) {
			continue
		}
		data := ScanData{
			SessionID: se.ID, ClassID: se.ClassID, StudentID: stu.ID, StudentName: stu.Name,
			CardID: card.ID, Counter: counter, Kind: "arrivee", Status: "present", Method: "porte", At: at,
		}
		if at.After(se.Starts.Add(minutes(st.LateMinutes))) {
			data.Status = "retard"
		}
		if ok, _ := a.Cache.SetNX(ctx, scanKey(se.ID, stu.ID), []byte(itoa64(at.Unix())), 18*time.Hour); ok {
			if err := a.Bus.Publish(ctx, events.New("scan.received", "", stu.ID, se.ID, data)); err != nil {
				a.Cache.Del(ctx, scanKey(se.ID, stu.ID))
				return res, err
			}
		}
	}
	return res, nil
}
