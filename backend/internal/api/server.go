// Package api expose la logique métier en HTTP/JSON sous /api/v1.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"edupilot/internal/app"
	"edupilot/internal/realtime"
)

const cookieName = "edupilot_session"

type Server struct {
	app *app.App
	hub *realtime.Hub
	mux *http.ServeMux
}

var (
	reqDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "edupilot_http_request_seconds",
		Help:    "Durée des requêtes HTTP.",
		Buckets: []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5},
	}, []string{"route", "code"})
	scanOutcomes = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "edupilot_scans_total",
		Help: "Pointages traités, par résultat.",
	}, []string{"outcome"})
)

func New(a *app.App, hub *realtime.Hub) *Server {
	s := &Server{app: a, hub: hub, mux: http.NewServeMux()}
	s.routes()
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h := w.Header()
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
	h.Set("X-Frame-Options", "DENY")
	if s.app.Cfg.CookieSecure {
		h.Set("Strict-Transport-Security", "max-age=31536000")
	}
	defer func() {
		if rec := recover(); rec != nil {
			slog.Error("panique dans un gestionnaire", "path", r.URL.Path, "panic", rec)
			writeJSON(w, http.StatusInternalServerError, errBody("erreur interne"))
		}
	}()
	s.mux.ServeHTTP(w, r)
}

// ---------------------------------------------------------------- routage

type authMode int

const (
	public authMode = iota
	user
)

type handlerFunc func(r *http.Request, p *app.Principal) (any, error)

// handle enregistre une route JSON : authentification, protection CSRF,
// mesure de durée et traduction des erreurs métier en codes HTTP.
func (s *Server) handle(pattern string, mode authMode, fn handlerFunc) {
	s.mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, code: 200}
		defer func() {
			reqDuration.WithLabelValues(pattern, strconv.Itoa(rec.code)).Observe(time.Since(start).Seconds())
		}()
		p, err := s.principal(r)
		if err != nil && mode == user {
			s.fail(rec, r, err)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead && p != nil && r.Header.Get("X-EduPilot") != "1" {
			s.fail(rec, r, app.ErrForbidden)
			return
		}
		out, err := fn(r, p)
		if err != nil {
			s.fail(rec, r, err)
			return
		}
		if out == nil {
			rec.WriteHeader(http.StatusNoContent)
			return
		}
		writeJSON(rec, http.StatusOK, out)
	})
}

func (s *Server) principal(r *http.Request) (*app.Principal, error) {
	token := ""
	if c, err := r.Cookie(cookieName); err == nil {
		token = c.Value
	} else if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
		token = strings.TrimPrefix(h, "Bearer ")
	}
	if token == "" {
		return nil, app.ErrUnauthorized
	}
	return s.app.Authenticate(r.Context(), token)
}

func (s *Server) fail(w http.ResponseWriter, r *http.Request, err error) {
	var inv *app.Invalid
	var conf *app.Conflict
	switch {
	case errors.As(err, &inv):
		writeJSON(w, http.StatusBadRequest, errBody(inv.Msg))
	case errors.As(err, &conf):
		writeJSON(w, http.StatusConflict, errBody(conf.Msg))
	case errors.Is(err, app.ErrNotFound):
		writeJSON(w, http.StatusNotFound, errBody("introuvable"))
	case errors.Is(err, app.ErrUnauthorized):
		writeJSON(w, http.StatusUnauthorized, errBody("connectez-vous pour continuer"))
	case errors.Is(err, app.ErrForbidden):
		writeJSON(w, http.StatusForbidden, errBody("accès refusé"))
	case errors.Is(err, app.ErrRateLimited):
		writeJSON(w, http.StatusTooManyRequests, errBody(err.Error()))
	case errors.Is(err, app.ErrBadSignature):
		writeJSON(w, http.StatusUnauthorized, errBody(err.Error()))
	case errors.Is(err, context.Canceled):
		w.WriteHeader(499)
	default:
		slog.Error("erreur interne", "method", r.Method, "path", r.URL.Path, "err", err)
		writeJSON(w, http.StatusInternalServerError, errBody("erreur interne, réessayez"))
	}
}

func errBody(msg string) map[string]string { return map[string]string{"error": msg} }

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func decode[T any](r *http.Request) (T, error) {
	var v T
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	if err := dec.Decode(&v); err != nil {
		return v, &app.Invalid{Msg: "requête JSON invalide"}
	}
	return v, nil
}

type statusRecorder struct {
	http.ResponseWriter
	code int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.code = code
	s.ResponseWriter.WriteHeader(code)
}

func clientIP(r *http.Request) string {
	if f := r.Header.Get("X-Forwarded-For"); f != "" {
		return strings.TrimSpace(strings.Split(f, ",")[0])
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// parseTime accepte RFC 3339 ou AAAA-MM-JJ (minuit, heure de l'établissement).
func (s *Server) parseTime(v string, def time.Time) (time.Time, error) {
	if v == "" {
		return def, nil
	}
	if t, err := time.Parse(time.RFC3339, v); err == nil {
		return t, nil
	}
	t, err := time.ParseInLocation(time.DateOnly, v, s.app.Cfg.Location)
	if err != nil {
		return t, &app.Invalid{Msg: "date invalide : " + v}
	}
	return t, nil
}

func (s *Server) setSessionCookie(w http.ResponseWriter, token string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name: cookieName, Value: token, Path: "/", MaxAge: maxAge,
		HttpOnly: true, Secure: s.app.Cfg.CookieSecure, SameSite: http.SameSiteLaxMode,
	})
}

func writeBinary(w http.ResponseWriter, ct string, data []byte) {
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Cache-Control", "private, max-age=300")
	w.Write(data)
}

// ---------------------------------------------------------------- fichiers statiques

// spa sert l'application React compilée ; toute route inconnue renvoie index.html.
func spa(dir string) http.Handler {
	fs := http.FileServer(http.Dir(dir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := filepath.Join(dir, filepath.Clean("/"+r.URL.Path))
		if st, err := os.Stat(path); err != nil || st.IsDir() {
			w.Header().Set("Cache-Control", "no-cache")
			http.ServeFile(w, r, filepath.Join(dir, "index.html"))
			return
		}
		if strings.HasPrefix(r.URL.Path, "/assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		fs.ServeHTTP(w, r)
	})
}

func metricsHandler() http.Handler { return promhttp.Handler() }
