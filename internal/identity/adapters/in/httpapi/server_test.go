package httpapi_test

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/meepleo/meepleo-api/api"
	"github.com/meepleo/meepleo-api/internal/identity/adapters/in/httpapi"
	"github.com/meepleo/meepleo-api/internal/identity/app"
	"github.com/meepleo/meepleo-api/internal/identity/domain"
	"github.com/meepleo/meepleo-api/internal/platform/auth"
	"github.com/meepleo/meepleo-api/internal/platform/httpserver"
)

type stubService struct {
	refreshErr error
	loggedOut  *domain.UserID
}

func (stubService) Guest(context.Context) (app.Tokens, error) {
	return app.Tokens{AccessToken: "a1", RefreshToken: "r1"}, nil
}

func (s stubService) Refresh(_ context.Context, token string) (app.Tokens, error) {
	if s.refreshErr != nil {
		return app.Tokens{}, s.refreshErr
	}
	return app.Tokens{AccessToken: "a2", RefreshToken: token + "-rotated"}, nil
}

func (s stubService) Logout(_ context.Context, userID domain.UserID) error {
	*s.loggedOut = userID
	return nil
}

type stubAuth struct{}

func (stubAuth) Verify(_ context.Context, token string) (auth.Principal, error) {
	if token == "valid" {
		return auth.Principal{UserID: "user-1"}, nil
	}
	return auth.Principal{}, errors.New("expired")
}

var discard = slog.New(slog.DiscardHandler)

func router(t *testing.T, svc stubService) http.Handler {
	t.Helper()
	spec, err := httpserver.LoadSpec(context.Background(), api.Spec)
	require.NoError(t, err)
	r := httpserver.NewRouter(httpserver.RouterConfig{Logger: discard, RequestTimeout: time.Second, MaxBodyBytes: 1 << 20, Authenticator: stubAuth{}})
	httpapi.Mount(r, httpapi.NewServer(svc, discard), httpserver.RequestValidator(spec, discard))
	return r
}

func post(t *testing.T, h http.Handler, path, body, token, lang string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if lang != "" {
		req.Header.Set("Accept-Language", lang)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out map[string]any
	if rec.Body.Len() > 0 {
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out), rec.Body.String())
	}
	return rec, out
}

func TestCreateGuestIsPublic(t *testing.T) {
	t.Parallel()
	rec, body := post(t, router(t, stubService{}), "/auth/guest", "", "", "")
	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, map[string]any{"access_token": "a1", "refresh_token": "r1"}, body)
}

func TestRefresh(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name     string
		svc      stubService
		body     string
		token    string
		wantCode int
		wantErr  string
	}{
		{"success", stubService{}, `{"refresh_token":"r1"}`, "", http.StatusOK, ""},
		{"works with an expired access token", stubService{}, `{"refresh_token":"r1"}`, "expired", http.StatusOK, ""},
		{"invalid", stubService{refreshErr: domain.ErrInvalidRefreshToken}, `{"refresh_token":"x"}`, "", http.StatusUnauthorized, "invalid_refresh_token"},
		{"expired", stubService{refreshErr: domain.ErrRefreshTokenExpired}, `{"refresh_token":"x"}`, "", http.StatusUnauthorized, "refresh_token_expired"},
		{"reused", stubService{refreshErr: domain.ErrRefreshTokenReused}, `{"refresh_token":"x"}`, "", http.StatusUnauthorized, "refresh_token_reused"},
		{"missing field", stubService{}, `{}`, "", http.StatusBadRequest, "invalid_request"},
		{"malformed json", stubService{}, `{`, "", http.StatusBadRequest, "invalid_request"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			rec, body := post(t, router(t, tt.svc), "/auth/refresh", tt.body, tt.token, "en")
			assert.Equal(t, tt.wantCode, rec.Code)
			if tt.wantErr != "" {
				assert.Equal(t, tt.wantErr, body["code"])
				assert.NotEmpty(t, body["message"])
			} else {
				assert.Equal(t, "r1-rotated", body["refresh_token"])
			}
		})
	}
}

func TestLogout(t *testing.T) {
	t.Parallel()
	var loggedOut domain.UserID
	h := router(t, stubService{loggedOut: &loggedOut})

	rec, body := post(t, h, "/auth/logout", "", "", "fr")
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
	assert.Equal(t, "Authentification requise.", body["message"])

	rec, _ = post(t, h, "/auth/logout", "", "valid", "")
	assert.Equal(t, http.StatusNoContent, rec.Code)
	assert.Equal(t, domain.UserID("user-1"), loggedOut)
}
