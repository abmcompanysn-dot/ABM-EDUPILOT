package api

import (
	"encoding/csv"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"edupilot/internal/app"
)

func (s *Server) routes() {
	a := s.app
	m := s.mux

	m.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) })
	m.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		if err := a.Pool.Ping(r.Context()); err != nil {
			http.Error(w, "base indisponible", http.StatusServiceUnavailable)
			return
		}
		w.Write([]byte("ok"))
	})
	m.Handle("GET /metrics", metricsHandler())

	// ------------------------------------------------------------ authentification
	m.HandleFunc("POST /api/v1/auth/login", func(w http.ResponseWriter, r *http.Request) {
		in, err := decode[app.LoginInput](r)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		in.IP, in.UserAgent = clientIP(r), r.UserAgent()
		token, p, err := a.Login(r.Context(), in)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		s.setSessionCookie(w, token, int((30 * 24 * time.Hour).Seconds()))
		writeJSON(w, http.StatusOK, p)
	})
	m.HandleFunc("POST /api/v1/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		if c, err := r.Cookie(cookieName); err == nil {
			a.Logout(r.Context(), c.Value)
		}
		s.setSessionCookie(w, "", -1)
		w.WriteHeader(http.StatusNoContent)
	})
	m.HandleFunc("POST /api/v1/auth/register", func(w http.ResponseWriter, r *http.Request) {
		in, err := decode[app.RegisterInput](r)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		if _, err := a.Register(r.Context(), in, clientIP(r)); err != nil {
			s.fail(w, r, err)
			return
		}
		token, p, err := a.Login(r.Context(), app.LoginInput{Email: in.Email, Password: in.Password, IP: clientIP(r), UserAgent: r.UserAgent()})
		if err != nil {
			s.fail(w, r, err)
			return
		}
		s.setSessionCookie(w, token, int((30 * 24 * time.Hour).Seconds()))
		writeJSON(w, http.StatusOK, p)
	})
	s.handle("GET /api/v1/auth/me", user, func(r *http.Request, p *app.Principal) (any, error) { return p, nil })
	s.handle("POST /api/v1/auth/password", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[struct{ Current, Next string }](r)
		if err != nil {
			return nil, err
		}
		token := ""
		if c, err := r.Cookie(cookieName); err == nil {
			token = c.Value
		}
		return nil, a.ChangePassword(r.Context(), p, token, in.Current, in.Next)
	})

	// ------------------------------------------------------------ public
	s.handle("GET /api/v1/public/school", public, func(r *http.Request, _ *app.Principal) (any, error) {
		st, err := a.Settings(r.Context())
		return map[string]string{"school_name": st.SchoolName}, err
	})
	s.handle("GET /api/v1/public/invite/{code}", public, func(r *http.Request, _ *app.Principal) (any, error) {
		info, _, err := a.ClassByInvite(r.Context(), r.PathValue("code"))
		return info, err
	})
	s.handle("GET /api/v1/id/verify", public, func(r *http.Request, p *app.Principal) (any, error) {
		q := r.URL.Query()
		return a.VerifyID(r.Context(), p, "/id?e="+q.Get("e")+"&c="+q.Get("c"), clientIP(r))
	})
	m.HandleFunc("GET /api/v1/id/photo/{student}", func(w http.ResponseWriter, r *http.Request) {
		p, _ := s.principal(r)
		data, ct, err := a.StudentPhoto(r.Context(), p, r.PathValue("student"), r.URL.Query().Get("proof"))
		if err != nil {
			s.fail(w, r, err)
			return
		}
		writeBinary(w, ct, data)
	})
	s.handle("GET /api/v1/public/profiles/{slug}", public, func(r *http.Request, _ *app.Principal) (any, error) {
		return a.PublicProfile(r.Context(), r.PathValue("slug"))
	})
	m.HandleFunc("GET /api/v1/public/profiles/{slug}/photo", func(w http.ResponseWriter, r *http.Request) {
		data, ct, err := a.PublicProfilePhoto(r.Context(), r.PathValue("slug"))
		if err != nil {
			s.fail(w, r, err)
			return
		}
		writeBinary(w, ct, data)
	})
	m.HandleFunc("GET /api/v1/public/profiles/{slug}/vcard", func(w http.ResponseWriter, r *http.Request) {
		card, err := a.VCard(r.Context(), r.PathValue("slug"))
		if err != nil {
			s.fail(w, r, err)
			return
		}
		w.Header().Set("Content-Type", "text/vcard; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="contact.vcf"`)
		io.WriteString(w, card)
	})

	// ------------------------------------------------------------ espace personnel
	s.handle("GET /api/v1/me/unread", user, func(r *http.Request, p *app.Principal) (any, error) { return a.Unread(r.Context(), p) })
	s.handle("GET /api/v1/me/notifications", user, func(r *http.Request, p *app.Principal) (any, error) {
		return a.ListNotifications(r.Context(), p)
	})
	s.handle("POST /api/v1/me/notifications/read", user, func(r *http.Request, p *app.Principal) (any, error) {
		return nil, a.MarkNotificationsRead(r.Context(), p, r.URL.Query().Get("id"))
	})
	s.handle("GET /api/v1/me/student", user, func(r *http.Request, p *app.Principal) (any, error) {
		return a.GetStudent(r.Context(), p, p.UserID)
	})
	s.handle("GET /api/v1/me/schedule", user, func(r *http.Request, p *app.Principal) (any, error) {
		from, to, err := s.period(r, 7)
		if err != nil {
			return nil, err
		}
		return a.MySchedule(r.Context(), p, from, to)
	})
	s.handle("GET /api/v1/me/attendance", user, func(r *http.Request, p *app.Principal) (any, error) {
		return a.StudentAttendance(r.Context(), p, p.UserID)
	})
	s.handle("GET /api/v1/me/profile", user, func(r *http.Request, p *app.Principal) (any, error) { return a.MyProfile(r.Context(), p) })
	s.handle("PUT /api/v1/me/profile", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[app.ProfileInput](r)
		if err != nil {
			return nil, err
		}
		return a.UpdateMyProfile(r.Context(), p, in)
	})
	s.handle("POST /api/v1/me/photo", user, func(r *http.Request, p *app.Principal) (any, error) {
		data, err := io.ReadAll(io.LimitReader(r.Body, 3<<20))
		if err != nil {
			return nil, err
		}
		return nil, a.RequestPhoto(r.Context(), p, data)
	})
	m.HandleFunc("GET /api/v1/me/photo", func(w http.ResponseWriter, r *http.Request) {
		p, err := s.principal(r)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		data, ct, err := a.StudentPhoto(r.Context(), p, p.UserID, "")
		if err != nil {
			s.fail(w, r, err)
			return
		}
		writeBinary(w, ct, data)
	})

	// ------------------------------------------------------------ paramètres et structure
	s.handle("GET /api/v1/settings", user, func(r *http.Request, p *app.Principal) (any, error) { return a.Settings(r.Context()) })
	s.handle("PUT /api/v1/settings", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[app.Settings](r)
		if err != nil {
			return nil, err
		}
		return a.UpdateSettings(r.Context(), p, in)
	})
	s.handle("GET /api/v1/years", user, func(r *http.Request, p *app.Principal) (any, error) { return a.ListYears(r.Context()) })
	s.handle("POST /api/v1/years", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[app.AcademicYear](r)
		if err != nil {
			return nil, err
		}
		in.ID = ""
		return a.SaveYear(r.Context(), p, in)
	})
	s.handle("PUT /api/v1/years/{id}", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[app.AcademicYear](r)
		if err != nil {
			return nil, err
		}
		in.ID = r.PathValue("id")
		return a.SaveYear(r.Context(), p, in)
	})
	s.handle("GET /api/v1/filieres", user, func(r *http.Request, p *app.Principal) (any, error) { return a.ListFilieres(r.Context()) })
	s.handle("POST /api/v1/filieres", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[app.Filiere](r)
		if err != nil {
			return nil, err
		}
		in.ID = ""
		return a.SaveFiliere(r.Context(), p, in)
	})
	s.handle("PUT /api/v1/filieres/{id}", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[app.Filiere](r)
		if err != nil {
			return nil, err
		}
		in.ID = r.PathValue("id")
		return a.SaveFiliere(r.Context(), p, in)
	})
	s.handle("DELETE /api/v1/filieres/{id}", user, func(r *http.Request, p *app.Principal) (any, error) {
		return nil, a.DeleteFiliere(r.Context(), p, r.PathValue("id"))
	})
	s.handle("GET /api/v1/classes", user, func(r *http.Request, p *app.Principal) (any, error) { return a.ListClasses(r.Context(), p) })
	s.handle("POST /api/v1/classes", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[app.ClassInput](r)
		if err != nil {
			return nil, err
		}
		return a.SaveClass(r.Context(), p, "", in)
	})
	s.handle("GET /api/v1/classes/{id}", user, func(r *http.Request, p *app.Principal) (any, error) {
		return a.GetClass(r.Context(), p, r.PathValue("id"))
	})
	s.handle("PUT /api/v1/classes/{id}", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[app.ClassInput](r)
		if err != nil {
			return nil, err
		}
		return a.SaveClass(r.Context(), p, r.PathValue("id"), in)
	})
	s.handle("DELETE /api/v1/classes/{id}", user, func(r *http.Request, p *app.Principal) (any, error) {
		return nil, a.DeleteClass(r.Context(), p, r.PathValue("id"))
	})
	s.handle("POST /api/v1/classes/{id}/invite", user, func(r *http.Request, p *app.Principal) (any, error) {
		return a.RegenerateInvite(r.Context(), p, r.PathValue("id"))
	})
	s.handle("PUT /api/v1/classes/{id}/managers", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[struct {
			UserIDs []string `json:"user_ids"`
		}](r)
		if err != nil {
			return nil, err
		}
		return a.SetManagers(r.Context(), p, r.PathValue("id"), in.UserIDs)
	})

	// ------------------------------------------------------------ modules et cours
	s.handle("GET /api/v1/classes/{id}/modules", user, func(r *http.Request, p *app.Principal) (any, error) {
		return a.ListModules(r.Context(), p, r.PathValue("id"))
	})
	s.handle("POST /api/v1/classes/{id}/modules", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[app.ModuleInput](r)
		if err != nil {
			return nil, err
		}
		return a.SaveModule(r.Context(), p, r.PathValue("id"), "", in)
	})
	s.handle("PUT /api/v1/modules/{id}", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[app.ModuleInput](r)
		if err != nil {
			return nil, err
		}
		return a.SaveModule(r.Context(), p, "", r.PathValue("id"), in)
	})
	s.handle("DELETE /api/v1/modules/{id}", user, func(r *http.Request, p *app.Principal) (any, error) {
		return nil, a.DeleteModule(r.Context(), p, r.PathValue("id"))
	})
	s.handle("GET /api/v1/classes/{id}/sessions", user, func(r *http.Request, p *app.Principal) (any, error) {
		from, to, err := s.period(r, 7)
		if err != nil {
			return nil, err
		}
		return a.ListSessions(r.Context(), p, r.PathValue("id"), from, to)
	})
	s.handle("GET /api/v1/classes/{id}/current-session", user, func(r *http.Request, p *app.Principal) (any, error) {
		cur, err := a.CurrentSession(r.Context(), p, r.PathValue("id"))
		if err != nil {
			return nil, err
		}
		return map[string]any{"session": cur}, nil
	})
	s.handle("POST /api/v1/sessions", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[app.SessionInput](r)
		if err != nil {
			return nil, err
		}
		return a.SaveSession(r.Context(), p, "", in)
	})
	s.handle("GET /api/v1/sessions/{id}", user, func(r *http.Request, p *app.Principal) (any, error) {
		return a.GetSession(r.Context(), p, r.PathValue("id"))
	})
	s.handle("PUT /api/v1/sessions/{id}", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[app.SessionInput](r)
		if err != nil {
			return nil, err
		}
		return a.SaveSession(r.Context(), p, r.PathValue("id"), in)
	})
	s.handle("POST /api/v1/sessions/{id}/status", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[struct{ Status string }](r)
		if err != nil {
			return nil, err
		}
		return a.SetSessionStatus(r.Context(), p, r.PathValue("id"), in.Status)
	})
	s.handle("DELETE /api/v1/sessions/{id}", user, func(r *http.Request, p *app.Principal) (any, error) {
		return nil, a.DeleteSession(r.Context(), p, r.PathValue("id"))
	})
	s.handle("GET /api/v1/sessions/{id}/roster", user, func(r *http.Request, p *app.Principal) (any, error) {
		se, list, err := a.Roster(r.Context(), p, r.PathValue("id"))
		return map[string]any{"session": se, "students": list}, err
	})
	s.handle("POST /api/v1/sessions/{id}/attendance", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[struct {
			StudentIDs []string `json:"student_ids"`
			app.MarkInput
		}](r)
		if err != nil {
			return nil, err
		}
		return nil, a.MarkAttendance(r.Context(), p, r.PathValue("id"), in.StudentIDs, in.MarkInput)
	})
	s.handle("POST /api/v1/scans", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[app.ScanInput](r)
		if err != nil {
			return nil, err
		}
		res, err := a.Scan(r.Context(), p, in)
		if err == nil {
			scanOutcomes.WithLabelValues(res.Outcome).Inc()
		}
		return res, err
	})
	s.handle("GET /api/v1/sessions/{id}/qr", user, func(r *http.Request, p *app.Principal) (any, error) {
		return a.SessionQRCode(r.Context(), p, r.PathValue("id"))
	})
	s.handle("POST /api/v1/checkin", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[app.CheckInInput](r)
		if err != nil {
			return nil, err
		}
		res, err := a.CheckIn(r.Context(), p, in)
		if err == nil {
			scanOutcomes.WithLabelValues(res.Outcome).Inc()
		}
		return res, err
	})

	// ------------------------------------------------------------ personnel et étudiants
	s.handle("GET /api/v1/staff", user, func(r *http.Request, p *app.Principal) (any, error) { return a.ListStaff(r.Context(), p) })
	s.handle("POST /api/v1/staff", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[app.StaffInput](r)
		if err != nil {
			return nil, err
		}
		u, pw, err := a.CreateStaff(r.Context(), p, in)
		return map[string]any{"user": u, "temp_password": pw}, err
	})
	s.handle("PUT /api/v1/staff/{id}", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[app.StaffInput](r)
		if err != nil {
			return nil, err
		}
		return a.UpdateStaff(r.Context(), p, r.PathValue("id"), in)
	})
	s.handle("POST /api/v1/users/{id}/reset-password", user, func(r *http.Request, p *app.Principal) (any, error) {
		pw, err := a.ResetPassword(r.Context(), p, r.PathValue("id"))
		return map[string]string{"temp_password": pw}, err
	})
	s.handle("GET /api/v1/students", user, func(r *http.Request, p *app.Principal) (any, error) {
		q := r.URL.Query()
		return a.ListStudents(r.Context(), p, q.Get("class_id"), q.Get("q"))
	})
	s.handle("POST /api/v1/students", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[app.StudentInput](r)
		if err != nil {
			return nil, err
		}
		st, pw, err := a.CreateStudent(r.Context(), p, in)
		return map[string]any{"student": st, "temp_password": pw}, err
	})
	s.handle("GET /api/v1/students/{id}", user, func(r *http.Request, p *app.Principal) (any, error) {
		return a.GetStudent(r.Context(), p, r.PathValue("id"))
	})
	s.handle("PUT /api/v1/students/{id}", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[app.StudentInput](r)
		if err != nil {
			return nil, err
		}
		return a.UpdateStudent(r.Context(), p, r.PathValue("id"), in)
	})
	s.handle("GET /api/v1/students/{id}/attendance", user, func(r *http.Request, p *app.Principal) (any, error) {
		return a.StudentAttendance(r.Context(), p, r.PathValue("id"))
	})
	m.HandleFunc("GET /api/v1/students/{id}/photo", func(w http.ResponseWriter, r *http.Request) {
		p, err := s.principal(r)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		data, ct, err := a.StudentPhoto(r.Context(), p, r.PathValue("id"), "")
		if err != nil {
			s.fail(w, r, err)
			return
		}
		writeBinary(w, ct, data)
	})
	s.handle("PUT /api/v1/students/{id}/photo", user, func(r *http.Request, p *app.Principal) (any, error) {
		data, err := io.ReadAll(io.LimitReader(r.Body, 3<<20))
		if err != nil {
			return nil, err
		}
		return nil, a.SetPhoto(r.Context(), p, r.PathValue("id"), data)
	})
	s.handle("POST /api/v1/classes/{id}/students/import", user, func(r *http.Request, p *app.Principal) (any, error) {
		rows, err := parseImport(r)
		if err != nil {
			return nil, err
		}
		return a.ImportStudents(r.Context(), p, r.PathValue("id"), rows)
	})
	s.handle("GET /api/v1/photo-requests", user, func(r *http.Request, p *app.Principal) (any, error) {
		return a.ListPhotoRequests(r.Context(), p)
	})
	m.HandleFunc("GET /api/v1/photo-requests/{id}/image", func(w http.ResponseWriter, r *http.Request) {
		p, err := s.principal(r)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		data, ct, err := a.PhotoRequestImage(r.Context(), p, r.PathValue("id"))
		if err != nil {
			s.fail(w, r, err)
			return
		}
		writeBinary(w, ct, data)
	})
	s.handle("POST /api/v1/photo-requests/{id}/approve", user, func(r *http.Request, p *app.Principal) (any, error) {
		return nil, a.DecidePhotoRequest(r.Context(), p, r.PathValue("id"), true)
	})
	s.handle("POST /api/v1/photo-requests/{id}/reject", user, func(r *http.Request, p *app.Principal) (any, error) {
		return nil, a.DecidePhotoRequest(r.Context(), p, r.PathValue("id"), false)
	})

	// ------------------------------------------------------------ cartes
	s.handle("GET /api/v1/cards", user, func(r *http.Request, p *app.Principal) (any, error) {
		q := r.URL.Query()
		return a.ListCards(r.Context(), p, q.Get("status"), q.Get("student_id"))
	})
	s.handle("POST /api/v1/students/{id}/cards", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[app.IssueInput](r)
		if err != nil {
			return nil, err
		}
		card, prog, err := a.IssueCard(r.Context(), p, r.PathValue("id"), in)
		return map[string]any{"card": card, "programming": prog}, err
	})
	s.handle("POST /api/v1/cards/{id}/revoke", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[struct{ Reason string }](r)
		if err != nil {
			return nil, err
		}
		return nil, a.RevokeCard(r.Context(), p, r.PathValue("id"), in.Reason)
	})

	// ------------------------------------------------------------ portes
	s.handle("GET /api/v1/devices", user, func(r *http.Request, p *app.Principal) (any, error) { return a.ListDevices(r.Context(), p) })
	s.handle("POST /api/v1/devices", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[app.DeviceInput](r)
		if err != nil {
			return nil, err
		}
		d, secret, err := a.SaveDevice(r.Context(), p, "", in, false)
		return map[string]any{"device": d, "secret": secret}, err
	})
	s.handle("PUT /api/v1/devices/{id}", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[app.DeviceInput](r)
		if err != nil {
			return nil, err
		}
		d, secret, err := a.SaveDevice(r.Context(), p, r.PathValue("id"), in, r.URL.Query().Get("rotate") == "1")
		return map[string]any{"device": d, "secret": secret}, err
	})
	s.handle("DELETE /api/v1/devices/{id}", user, func(r *http.Request, p *app.Principal) (any, error) {
		return nil, a.DeleteDevice(r.Context(), p, r.PathValue("id"))
	})
	s.handle("GET /api/v1/door-events", user, func(r *http.Request, p *app.Principal) (any, error) {
		n, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		return a.ListDoorEvents(r.Context(), p, n)
	})
	m.HandleFunc("POST /api/v1/devices/door/access", func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 4096))
		if err != nil {
			s.fail(w, r, err)
			return
		}
		res, err := a.DoorAccess(r.Context(), body, r.Header.Get("X-Signature"))
		if err != nil {
			s.fail(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, res)
	})

	m.HandleFunc("POST /api/v1/devices/door/sync", func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 4096))
		if err != nil {
			s.fail(w, r, err)
			return
		}
		out, sig, err := a.DoorSync(r.Context(), body, r.Header.Get("X-Signature"))
		if err != nil {
			s.fail(w, r, err)
			return
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("X-Signature", sig)
		w.Header().Set("Cache-Control", "no-store")
		io.WriteString(w, out)
	})
	m.HandleFunc("POST /api/v1/devices/door/events", func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(io.LimitReader(r.Body, 128<<10))
		if err != nil {
			s.fail(w, r, err)
			return
		}
		res, err := a.DoorOfflineEvents(r.Context(), body, r.Header.Get("X-Signature"))
		if err != nil {
			s.fail(w, r, err)
			return
		}
		writeJSON(w, http.StatusOK, res)
	})

	// ------------------------------------------------------------ communication
	s.handle("GET /api/v1/announcements", user, func(r *http.Request, p *app.Principal) (any, error) {
		return a.ListAnnouncements(r.Context(), p)
	})
	s.handle("POST /api/v1/announcements", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[app.AnnouncementInput](r)
		if err != nil {
			return nil, err
		}
		return nil, a.PostAnnouncement(r.Context(), p, in)
	})
	s.handle("DELETE /api/v1/announcements/{id}", user, func(r *http.Request, p *app.Principal) (any, error) {
		return nil, a.DeleteAnnouncement(r.Context(), p, r.PathValue("id"))
	})
	s.handle("POST /api/v1/announcements/{id}/read", user, func(r *http.Request, p *app.Principal) (any, error) {
		return nil, a.MarkAnnouncementRead(r.Context(), p, r.PathValue("id"))
	})
	s.handle("POST /api/v1/feedback", user, func(r *http.Request, p *app.Principal) (any, error) {
		in, err := decode[struct {
			Rating  int    `json:"rating"`
			Comment string `json:"comment"`
		}](r)
		if err != nil {
			return nil, err
		}
		return nil, a.SubmitFeedback(r.Context(), p, in.Rating, in.Comment)
	})
	s.handle("GET /api/v1/feedback", user, func(r *http.Request, p *app.Principal) (any, error) { return a.ListFeedback(r.Context(), p) })

	// ------------------------------------------------------------ statistiques, exports, journal
	s.handle("GET /api/v1/stats/overview", user, func(r *http.Request, p *app.Principal) (any, error) { return a.Overview(r.Context(), p) })
	s.handle("GET /api/v1/classes/{id}/stats", user, func(r *http.Request, p *app.Principal) (any, error) {
		return a.ClassStats(r.Context(), p, r.PathValue("id"))
	})
	m.HandleFunc("GET /api/v1/classes/{id}/attendance.csv", func(w http.ResponseWriter, r *http.Request) {
		p, err := s.principal(r)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		from, to, err := s.period(r, 31)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		if !p.CanManageClass(r.PathValue("id")) {
			s.fail(w, r, app.ErrForbidden)
			return
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="presences_%s_%s.csv"`, from.Format("2006-01-02"), to.Format("2006-01-02")))
		if err := a.ExportAttendanceCSV(r.Context(), p, r.PathValue("id"), from, to, w); err != nil {
			s.fail(w, r, err)
		}
	})
	s.handle("GET /api/v1/audit", user, func(r *http.Request, p *app.Principal) (any, error) {
		q := r.URL.Query()
		var before *time.Time
		if v := q.Get("before"); v != "" {
			t, err := time.Parse(time.RFC3339Nano, v)
			if err != nil {
				return nil, &app.Invalid{Msg: "paramètre before invalide"}
			}
			before = &t
		}
		n, _ := strconv.Atoi(q.Get("limit"))
		return a.ListAudit(r.Context(), p, q.Get("type"), before, n)
	})

	// ------------------------------------------------------------ temps réel
	m.HandleFunc("GET /api/v1/ws", func(w http.ResponseWriter, r *http.Request) {
		p, err := s.principal(r)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		classID := r.URL.Query().Get("class_id")
		switch {
		case classID == "" && p.IsAdmin():
			s.hub.Serve(w, r, true, nil)
		case classID != "" && p.CanManageClass(classID):
			s.hub.Serve(w, r, false, []string{classID})
		default:
			s.fail(w, r, app.ErrForbidden)
		}
	})

	if dir := a.Cfg.StaticDir; dir != "" {
		m.Handle("GET /", spa(dir))
	}
}

// period lit from/to ; par défaut, la semaine (ou les n jours) à partir d'aujourd'hui.
func (s *Server) period(r *http.Request, days int) (time.Time, time.Time, error) {
	q := r.URL.Query()
	n := time.Now().In(s.app.Cfg.Location)
	today := time.Date(n.Year(), n.Month(), n.Day(), 0, 0, 0, 0, s.app.Cfg.Location)
	from, err := s.parseTime(q.Get("from"), today)
	if err != nil {
		return from, from, err
	}
	to, err := s.parseTime(q.Get("to"), from.AddDate(0, 0, days))
	return from, to, err
}

// parseImport accepte du JSON (liste) ou un CSV « matricule;nom;email;telephone;date_naissance ».
func parseImport(r *http.Request) ([]app.StudentInput, error) {
	if strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		return decode[[]app.StudentInput](r)
	}
	cr := csv.NewReader(io.LimitReader(r.Body, 2<<20))
	cr.Comma = ';'
	cr.FieldsPerRecord = -1
	cr.TrimLeadingSpace = true
	recs, err := cr.ReadAll()
	if err != nil {
		return nil, &app.Invalid{Msg: "CSV illisible : " + err.Error()}
	}
	var out []app.StudentInput
	for i, rec := range recs {
		if len(rec) < 3 {
			continue
		}
		if i == 0 && strings.Contains(strings.ToLower(rec[0]), "matricule") {
			continue
		}
		in := app.StudentInput{Matricule: rec[0], FullName: rec[1], Email: rec[2]}
		if len(rec) > 3 {
			in.Phone = rec[3]
		}
		if len(rec) > 4 && strings.TrimSpace(rec[4]) != "" {
			d := strings.TrimSpace(rec[4])
			in.BirthDate = &d
		}
		out = append(out, in)
	}
	return out, nil
}
