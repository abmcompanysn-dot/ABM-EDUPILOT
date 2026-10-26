package app

import (
	"context"
	"errors"
	"strconv"
	"time"

	"edupilot/internal/events"
)

type ScanInput struct {
	SessionID string `json:"session_id"`
	TapInput
	Proof  string   `json:"proof"`
	Method string   `json:"method"` // nfc (défaut) ou qr
	Lat    *float64 `json:"lat"`
	Lng    *float64 `json:"lng"`
}

type ScanStudent struct {
	ID        string `json:"id"`
	FullName  string `json:"full_name"`
	Matricule string `json:"matricule"`
	HasPhoto  bool   `json:"has_photo"`
}

type ScanResult struct {
	Outcome string       `json:"outcome"` // present, retard, deja, depart, refuse
	Message string       `json:"message"`
	Student *ScanStudent `json:"student,omitempty"`
	At      time.Time    `json:"at"`
}

// ScanData est la charge de l'événement scan.received, écrite en base par le worker.
type ScanData struct {
	SessionID   string    `json:"session_id"`
	ClassID     string    `json:"class_id"`
	StudentID   string    `json:"student_id"`
	StudentName string    `json:"student_name"`
	CardID      string    `json:"card_id,omitempty"`
	Counter     int       `json:"counter,omitempty"`
	Kind        string    `json:"kind"` // arrivee ou depart
	Status      string    `json:"status"`
	Method      string    `json:"method"`
	At          time.Time `json:"at"`
	Lat         *float64  `json:"lat,omitempty"`
	Lng         *float64  `json:"lng,omitempty"`
	RecordedBy  string    `json:"recorded_by,omitempty"`
}

// Scan valide un passage de carte entièrement en mémoire puis le publie sur
// le bus ; l'écriture en base se fait par lots dans le worker. C'est ce qui
// permet d'encaisser des milliers de pointages simultanés.
func (a *App) Scan(ctx context.Context, p *Principal, in ScanInput) (ScanResult, error) {
	now := a.Now()
	refuse := func(msg string) (ScanResult, error) {
		return ScanResult{Outcome: "refuse", Message: msg, At: now}, nil
	}
	if !p.IsStaff() {
		return ScanResult{}, ErrForbidden
	}
	snap, err := a.Dir.get(ctx)
	if err != nil {
		return ScanResult{}, err
	}
	se, err := a.Dir.session(ctx, snap, in.SessionID)
	if err != nil {
		return ScanResult{}, err
	}
	if err := requireClass(p, se.ClassID); err != nil {
		return ScanResult{}, err
	}
	st, err := a.Settings(ctx)
	if err != nil {
		return ScanResult{}, err
	}
	if se.Status == "annule" {
		return refuse("ce cours est annulé")
	}
	if now.Before(se.Starts.Add(-minutes(st.WindowBeforeMinutes))) || now.After(se.Ends.Add(minutes(st.WindowAfterMinutes))) {
		return refuse("le pointage de ce cours n'est pas ouvert à cette heure")
	}

	var t tapResult
	if in.Proof != "" {
		claims, ok := a.verifyToken("idproof", in.Proof)
		if !ok {
			return refuse("vérification expirée : touchez de nouveau la carte")
		}
		cardID, studentID := parseProof(claims)
		t.student = snap.students[studentID]
		t.card = snap.cardsByID[cardID]
		if t.student == nil || t.card == nil || t.card.Status != "active" {
			return refuse("carte non valide")
		}
	} else {
		t, err = a.resolveTap(ctx, in.TapInput, true)
		if err != nil {
			var inv *Invalid
			var state cardStateErr
			if errors.As(err, &inv) || errors.As(err, &state) || errors.Is(err, errCardUnknown) || errors.Is(err, errCardReplay) || errors.Is(err, errCardForged) {
				if errors.Is(err, errCardReplay) || errors.Is(err, errCardForged) {
					studentID := ""
					if t.card != nil {
						studentID = t.card.StudentID
					}
					a.Bus.Publish(ctx, events.New("card.rejected_scan", p.UserID, studentID, in.SessionID, map[string]any{"session_id": in.SessionID, "reason": err.Error()}))
				}
				return refuse(err.Error())
			}
			return ScanResult{}, err
		}
	}
	stu := &ScanStudent{ID: t.student.ID, FullName: t.student.Name, Matricule: t.student.Matricule, HasPhoto: t.student.HasPhoto}
	if t.student.ClassID != se.ClassID {
		return ScanResult{Outcome: "refuse", Message: "cet étudiant n'est pas inscrit dans cette classe (" + t.student.ClassName + ")", Student: stu, At: now}, nil
	}

	data := ScanData{
		SessionID: se.ID, ClassID: se.ClassID, StudentID: t.student.ID, StudentName: t.student.Name,
		CardID: t.card.ID, Counter: t.counter, Kind: "arrivee", Status: "present",
		Method: "nfc", At: now, Lat: in.Lat, Lng: in.Lng, RecordedBy: p.UserID,
	}
	if in.Method == "qr" {
		data.Method = "qr"
	}
	if now.After(se.Starts.Add(minutes(st.LateMinutes))) {
		data.Status = "retard"
	}
	res := ScanResult{Outcome: data.Status, Student: stu, At: now}

	// Anti-doublon partagé (Redis) : le premier passage est l'arrivée, un passage
	// suffisamment plus tard est le départ, les autres sont ignorés.
	key := scanKey(se.ID, t.student.ID)
	first, err := a.Cache.SetNX(ctx, key, []byte(strconv.FormatInt(now.Unix(), 10)), 18*time.Hour)
	if err != nil {
		return ScanResult{}, err
	}
	if !first {
		raw, _, _ := a.Cache.Get(ctx, key)
		arrivedUnix, _ := strconv.ParseInt(string(raw), 10, 64)
		if now.Sub(time.Unix(arrivedUnix, 0)) < minutes(st.DepartureMinMinutes) {
			a.recordCounter(ctx, t)
			res.Outcome, res.Message = "deja", "déjà pointé à "+time.Unix(arrivedUnix, 0).In(a.Cfg.Location).Format("15:04")
			return res, nil
		}
		if ok, _ := a.Cache.SetNX(ctx, "dep:"+key, []byte("1"), 18*time.Hour); !ok {
			a.recordCounter(ctx, t)
			res.Outcome, res.Message = "deja", "départ déjà enregistré"
			return res, nil
		}
		data.Kind = "depart"
		res.Outcome, res.Message = "depart", "départ enregistré à "+now.In(a.Cfg.Location).Format("15:04")
	} else if data.Status == "retard" {
		res.Message = "en retard de " + strconv.Itoa(int(now.Sub(se.Starts).Minutes())) + " min"
	} else {
		res.Message = "présent à " + now.In(a.Cfg.Location).Format("15:04")
	}

	if err := a.Bus.Publish(ctx, events.New("scan.received", p.UserID, t.student.ID, se.ID, data)); err != nil {
		// Le pointage n'est pas enregistré : on libère la clé pour permettre un nouvel essai.
		if data.Kind == "arrivee" {
			a.Cache.Del(ctx, key)
		} else {
			a.Cache.Del(ctx, "dep:"+key)
		}
		return ScanResult{}, err
	}
	return res, nil
}
