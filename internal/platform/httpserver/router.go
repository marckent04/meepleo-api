// Package httpserver provides the HTTP plumbing shared by every module:
// router, middlewares, uniform error format, request validation against the
// OpenAPI contract, health probes, documentation and graceful shutdown.
//
// It contains no business logic and imports no module.
package httpserver

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"

	"github.com/meepleo/meepleo-api/internal/platform/auth"
	"github.com/meepleo/meepleo-api/internal/platform/i18n"
)

// RouterConfig configures NewRouter.
type RouterConfig struct {
	Logger             *slog.Logger
	RequestTimeout     time.Duration
	MaxBodyBytes       int64
	CORSAllowedOrigins []string
	Authenticator      auth.Authenticator
	Health             *Health
	// Spec is the raw OpenAPI document served on /docs. Nil disables /docs.
	Spec []byte
}

// NewRouter returns a chi router with the global middleware chain, the
// health probes and the documentation. Modules mount their routes on it.
//
// Order (CLAUDE.md): request ID, recover, logging, timeout, CORS, auth.
// Locale negotiation runs right after the request ID so that even a recovered
// panic is answered in the client's language.
func NewRouter(cfg RouterConfig) chi.Router {
	r := chi.NewRouter()

	r.Use(RequestID)
	r.Use(i18n.Middleware)
	r.Use(Recover(cfg.Logger))
	r.Use(Logging(cfg.Logger))
	r.Use(RouteTelemetry)
	r.Use(Timeout(cfg.RequestTimeout))
	r.Use(MaxBodyBytes(cfg.MaxBodyBytes))
	if len(cfg.CORSAllowedOrigins) > 0 {
		r.Use(cors.Handler(cors.Options{
			AllowedOrigins: cfg.CORSAllowedOrigins,
			AllowedMethods: []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete},
			AllowedHeaders: []string{"Authorization", "Content-Type", "Accept-Language", RequestIDHeader},
			ExposedHeaders: []string{RequestIDHeader},
			MaxAge:         300,
		}))
	}
	if cfg.Authenticator != nil {
		r.Use(auth.Middleware(cfg.Authenticator, cfg.Logger))
	}

	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		WritePlatformError(w, r, http.StatusNotFound, CodeNotFound)
	})
	r.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
		WritePlatformError(w, r, http.StatusMethodNotAllowed, CodeMethodNotAllowed)
	})

	if cfg.Health != nil {
		r.Get("/healthz", cfg.Health.Live)
		r.Get("/readyz", cfg.Health.Ready)
	}
	if cfg.Spec != nil {
		mountDocs(r, cfg.Spec)
	}
	return r
}
