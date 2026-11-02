// Package httpapi is the inbound HTTP adapter of the identity module. Routing
// and types are generated from the "identity" tag of api/openapi.yaml.
package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/meepleo/meepleo-api/internal/identity/app"
	"github.com/meepleo/meepleo-api/internal/identity/domain"
	"github.com/meepleo/meepleo-api/internal/platform/auth"
	"github.com/meepleo/meepleo-api/internal/platform/httpserver"
	"github.com/meepleo/meepleo-api/internal/platform/i18n"
)

// Error codes of the identity API. Every refresh failure is a 401: the app
// then clears its tokens and goes back to the welcome screen.
const (
	codeInvalidRefreshToken = "invalid_refresh_token"
	codeRefreshTokenExpired = "refresh_token_expired"
	codeRefreshTokenReused  = "refresh_token_reused"
	codeUnauthorized        = "unauthorized"
	codeInvalidRequest      = "invalid_request"
)

var messages = i18n.Catalog{
	codeInvalidRefreshToken: {
		i18n.French:  "Ta session n'est plus valide. Reconnecte-toi.",
		i18n.English: "Your session is no longer valid. Please sign in again.",
	},
	codeRefreshTokenExpired: {
		i18n.French:  "Ta session a expiré. Reconnecte-toi.",
		i18n.English: "Your session has expired. Please sign in again.",
	},
	codeRefreshTokenReused: {
		i18n.French:  "Ta session a été fermée par sécurité. Reconnecte-toi.",
		i18n.English: "Your session was closed for security reasons. Please sign in again.",
	},
	codeUnauthorized: {
		i18n.French:  "Authentification requise.",
		i18n.English: "Authentication required.",
	},
	codeInvalidRequest: {
		i18n.French:  "La requête est invalide.",
		i18n.English: "The request is invalid.",
	},
}

// Service is the part of the identity application the handlers use.
type Service interface {
	Guest(ctx context.Context) (app.Tokens, error)
	Refresh(ctx context.Context, refreshToken string) (app.Tokens, error)
	Logout(ctx context.Context, userID domain.UserID) error
}

// Server implements the generated StrictServerInterface.
type Server struct {
	svc Service
	log *slog.Logger
}

var _ StrictServerInterface = (*Server)(nil)

// NewServer returns the identity handlers.
func NewServer(svc Service, log *slog.Logger) *Server {
	return &Server{svc: svc, log: log}
}

// Mount registers the identity routes on r, behind the OpenAPI validator.
func Mount(r chi.Router, s *Server, validator func(http.Handler) http.Handler) {
	r.Group(func(r chi.Router) {
		r.Use(validator)
		strict := NewStrictHandlerWithOptions(s, nil, StrictHTTPServerOptions{
			RequestErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, _ error) {
				httpserver.WriteError(w, http.StatusBadRequest, codeInvalidRequest, messages.Get(i18n.Locale(r.Context()), codeInvalidRequest))
			},
			ResponseErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, err error) {
				httpserver.WriteUnexpected(w, r, s.log, err)
			},
		})
		HandlerWithOptions(strict, ChiServerOptions{
			BaseRouter: r,
			ErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, _ error) {
				httpserver.WriteError(w, http.StatusBadRequest, codeInvalidRequest, messages.Get(i18n.Locale(r.Context()), codeInvalidRequest))
			},
		})
	})
}

func unauthorized(ctx context.Context, code string) UnauthorizedJSONResponse {
	return UnauthorizedJSONResponse{Message: messages.Get(i18n.Locale(ctx), code), Code: &code}
}

// CreateGuest handles POST /auth/guest.
func (s *Server) CreateGuest(ctx context.Context, _ CreateGuestRequestObject) (CreateGuestResponseObject, error) {
	tokens, err := s.svc.Guest(ctx)
	if err != nil {
		return nil, err
	}
	return CreateGuest200JSONResponse{AccessToken: tokens.AccessToken, RefreshToken: tokens.RefreshToken}, nil
}

// RefreshTokens handles POST /auth/refresh.
func (s *Server) RefreshTokens(ctx context.Context, req RefreshTokensRequestObject) (RefreshTokensResponseObject, error) {
	if req.Body == nil {
		return RefreshTokens401JSONResponse{unauthorized(ctx, codeInvalidRefreshToken)}, nil
	}
	tokens, err := s.svc.Refresh(ctx, req.Body.RefreshToken)
	switch {
	case errors.Is(err, domain.ErrInvalidRefreshToken):
		return RefreshTokens401JSONResponse{unauthorized(ctx, codeInvalidRefreshToken)}, nil
	case errors.Is(err, domain.ErrRefreshTokenExpired):
		return RefreshTokens401JSONResponse{unauthorized(ctx, codeRefreshTokenExpired)}, nil
	case errors.Is(err, domain.ErrRefreshTokenReused):
		s.log.WarnContext(ctx, "refresh token reuse detected, token family revoked")
		return RefreshTokens401JSONResponse{unauthorized(ctx, codeRefreshTokenReused)}, nil
	case err != nil:
		return nil, err
	}
	return RefreshTokens200JSONResponse{AccessToken: tokens.AccessToken, RefreshToken: tokens.RefreshToken}, nil
}

// Logout handles POST /auth/logout.
func (s *Server) Logout(ctx context.Context, _ LogoutRequestObject) (LogoutResponseObject, error) {
	p, ok := auth.FromContext(ctx)
	if !ok {
		// The validator already enforces bearerAuth; this guards a
		// misconfigured route rather than a normal request.
		return Logout401JSONResponse{unauthorized(ctx, codeUnauthorized)}, nil
	}
	if err := s.svc.Logout(ctx, domain.UserID(p.UserID)); err != nil {
		return nil, err
	}
	return Logout204Response{}, nil
}
