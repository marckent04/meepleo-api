// Package auth carries the authenticated principal through the request
// context and provides the best-effort authentication middleware.
//
// The middleware never rejects a request: it only attaches a principal when
// the bearer token is valid. Whether an operation requires a principal is
// decided by the OpenAPI security requirements (see the per-module request
// validator), so the spec stays the single source of truth for public routes.
// Rejecting invalid tokens here would also break POST /auth/refresh, which
// the app calls precisely when its access token has expired.
package auth

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
)

// Principal is the authenticated caller.
type Principal struct {
	UserID string
}

// Authenticator verifies an access token. It is implemented by the identity
// module and wired in the composition root.
type Authenticator interface {
	Verify(ctx context.Context, accessToken string) (Principal, error)
}

type principalKey struct{}

// WithPrincipal returns a context carrying p.
func WithPrincipal(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, principalKey{}, p)
}

// FromContext returns the principal stored in ctx, if any.
func FromContext(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(principalKey{}).(Principal)
	return p, ok && p.UserID != ""
}

// Middleware attaches the principal of a valid bearer token to the request.
func Middleware(a Authenticator, log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token, ok := bearer(r.Header.Get("Authorization"))
			if !ok {
				next.ServeHTTP(w, r)
				return
			}
			p, err := a.Verify(r.Context(), token)
			if err != nil {
				// Debug only: expired tokens are routine and must not flood logs.
				log.DebugContext(r.Context(), "bearer token rejected", slog.String("error", err.Error()))
				next.ServeHTTP(w, r)
				return
			}
			next.ServeHTTP(w, r.WithContext(WithPrincipal(r.Context(), p)))
		})
	}
}

func bearer(header string) (string, bool) {
	scheme, token, ok := strings.Cut(header, " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") || strings.TrimSpace(token) == "" {
		return "", false
	}
	return strings.TrimSpace(token), true
}
