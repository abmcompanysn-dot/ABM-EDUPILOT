package app

import (
	"context"
	"net/url"
	"time"
)

// Le QR projeté par le responsable change toutes les qrRefresh secondes ; un
// jeton reste accepté qrTokenTTL pour laisser le temps d'ouvrir le lien (et de
// se connecter si besoin). Une photo du QR transmise à un absent expire vite.
const (
	qrRefresh  = 15 * time.Second
	qrTokenTTL = 90 * time.Second
)

type SessionQR struct {
	Token      string    `json:"token"`
	URL        string    `json:"url"`
	ExpiresAt  time.Time `json:"expires_at"`
	RefreshIn  int       `json:"refresh_in"`
	ModuleName string    `json:"module_name"`
}

type CheckInInput struct {
	Token string   `json:"token"`
	Lat   *float64 `json:"lat"`
	Lng   *float64 `json:"lng"`
}

// pointageOpen refuse hors de la fenêtre de pointage du cours.
func pointageOpen(se *dirSession, st Settings, now time.Time) error {
	if se.Status == "annule" {
		return invalid("ce cours est annulé")
	}
	if now.Before(se.Starts.Add(-minutes(st.WindowBeforeMinutes))) || now.After(se.Ends.Add(minutes(st.WindowAfterMinutes))) {
		return invalid("le pointage de ce cours n'est pas ouvert à cette heure")
	}
	return nil
}

// SessionQRCode délivre au responsable le jeton du QR de présence à afficher.
func (a *App) SessionQRCode(ctx context.Context, p *Principal, sessionID string) (SessionQR, error) {
	if !p.IsStaff() {
		return SessionQR{}, ErrForbidden
	}
	snap, err := a.Dir.get(ctx)
	if err != nil {
		return SessionQR{}, err
	}
	se, err := a.Dir.session(ctx, snap, sessionID)
	if err != nil {
		return SessionQR{}, err
	}
	if err := requireClass(p, se.ClassID); err != nil {
		return SessionQR{}, err
	}
	st, err := a.Settings(ctx)
	if err != nil {
		return SessionQR{}, err
	}
	now := a.Now()
	if err := pointageOpen(se, st, now); err != nil {
		return SessionQR{}, err
	}
	tok := a.signToken("checkin", map[string]any{"s": se.ID, "b": p.UserID}, qrTokenTTL)
	return SessionQR{
		Token:      tok,
		URL:        a.Cfg.PublicURL + "/presence?t=" + url.QueryEscape(tok),
		ExpiresAt:  now.Add(qrTokenTTL),
		RefreshIn:  int(qrRefresh / time.Second),
		ModuleName: se.ModuleName,
	}, nil
}

// CheckIn enregistre la présence d'un étudiant qui a scanné le QR du cours.
func (a *App) CheckIn(ctx context.Context, p *Principal, in CheckInInput) (ScanResult, error) {
	now := a.Now()
	if p == nil || p.Role != RoleStudent {
		return ScanResult{}, ErrForbidden
	}
	claims, ok := a.verifyToken("checkin", in.Token)
	if !ok {
		return ScanResult{Outcome: "refuse", Message: "QR expiré : scannez de nouveau le code affiché en classe", At: now}, nil
	}
	sessionID, _ := claims["s"].(string)
	shownBy, _ := claims["b"].(string)
	snap, err := a.Dir.get(ctx)
	if err != nil {
		return ScanResult{}, err
	}
	se, err := a.Dir.session(ctx, snap, sessionID)
	if err != nil {
		return ScanResult{}, err
	}
	stud := snap.students[p.UserID]
	if stud == nil || !stud.Active {
		return ScanResult{}, ErrForbidden
	}
	stu := &ScanStudent{ID: stud.ID, FullName: stud.Name, Matricule: stud.Matricule, HasPhoto: stud.HasPhoto}
	if stud.ClassID != se.ClassID {
		return ScanResult{Outcome: "refuse", Message: "ce cours n'est pas celui de votre classe", Student: stu, At: now}, nil
	}
	st, err := a.Settings(ctx)
	if err != nil {
		return ScanResult{}, err
	}
	if err := pointageOpen(se, st, now); err != nil {
		return ScanResult{Outcome: "refuse", Message: err.Error(), Student: stu, At: now}, nil
	}
	data := ScanData{
		SessionID: se.ID, ClassID: se.ClassID, StudentID: stud.ID, StudentName: stud.Name,
		Kind: "arrivee", Status: "present", Method: "qr", At: now, Lat: in.Lat, Lng: in.Lng, RecordedBy: shownBy,
	}
	return a.commitScan(ctx, p.UserID, se, st, data, stu, func() {})
}
