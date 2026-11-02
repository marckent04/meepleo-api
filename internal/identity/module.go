// Package identity is the identity module: guest accounts, JWT access tokens
// and rotating refresh tokens.
//
// This file wires the module for the composition root. The module implements
// platform/auth.Authenticator, which main passes to the auth middleware; no
// other module needs identity yet, so there is no contract package (add one
// when a module does).
package identity

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/meepleo/meepleo-api/internal/identity/adapters/in/httpapi"
	"github.com/meepleo/meepleo-api/internal/identity/adapters/out/jwt"
	"github.com/meepleo/meepleo-api/internal/identity/adapters/out/postgres"
	"github.com/meepleo/meepleo-api/internal/identity/app"
	"github.com/meepleo/meepleo-api/internal/platform/auth"
)

// Deps are the dependencies of the module.
type Deps struct {
	Pool            *pgxpool.Pool
	Logger          *slog.Logger
	Now             func() time.Time
	JWTSecret       []byte
	Issuer          string
	Audience        string
	AccessTokenTTL  time.Duration
	RefreshTokenTTL time.Duration
}

// Module is the identity module.
type Module struct {
	svc    *app.Service
	server *httpapi.Server
}

var _ auth.Authenticator = (*Module)(nil)

// New wires the module.
func New(d Deps) *Module {
	if d.Now == nil {
		d.Now = time.Now
	}
	log := d.Logger.With(slog.String("module", "identity"))
	tokens := jwt.New(jwt.Config{Secret: d.JWTSecret, Issuer: d.Issuer, Audience: d.Audience, TTL: d.AccessTokenTTL})
	svc := app.NewService(postgres.NewRepository(d.Pool), tokens, d.Now, d.RefreshTokenTTL)
	return &Module{svc: svc, server: httpapi.NewServer(svc, log)}
}

// Mount registers the identity HTTP routes behind validator.
func (m *Module) Mount(r chi.Router, validator func(http.Handler) http.Handler) {
	httpapi.Mount(r, m.server, validator)
}

// Verify implements auth.Authenticator.
func (m *Module) Verify(ctx context.Context, accessToken string) (auth.Principal, error) {
	userID, err := m.svc.Authenticate(ctx, accessToken)
	if err != nil {
		return auth.Principal{}, err
	}
	return auth.Principal{UserID: string(userID)}, nil
}
