package httpapi_test

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/meepleo/meepleo-api/api"
	"github.com/meepleo/meepleo-api/internal/catalog/adapters/in/httpapi"
	"github.com/meepleo/meepleo-api/internal/catalog/app"
	"github.com/meepleo/meepleo-api/internal/catalog/domain"
	"github.com/meepleo/meepleo-api/internal/platform/auth"
	"github.com/meepleo/meepleo-api/internal/platform/httpserver"
)

type stubService struct {
	game   domain.Game
	lookup app.LookupResult
	err    error
}

func (s stubService) Game(_ context.Context, id domain.GameID) (domain.Game, error) {
	if s.err != nil {
		return domain.Game{}, s.err
	}
	g := s.game
	g.ID = id
	return g, nil
}

func (s stubService) LookupBarcode(context.Context, string) (app.LookupResult, error) {
	return s.lookup, s.err
}

type stubAuth struct{}

func (stubAuth) Verify(_ context.Context, token string) (auth.Principal, error) {
	if token == "valid" {
		return auth.Principal{UserID: "user-1"}, nil
	}
	return auth.Principal{}, errors.New("invalid token")
}

var discard = slog.New(slog.DiscardHandler)

func newRouter(t *testing.T, svc httpapi.Service) http.Handler {
	t.Helper()
	spec, err := httpserver.LoadSpec(context.Background(), api.Spec)
	require.NoError(t, err)
	r := httpserver.NewRouter(httpserver.RouterConfig{
		Logger: discard, RequestTimeout: time.Second, MaxBodyBytes: 1 << 20, Authenticator: stubAuth{},
	})
	httpapi.Mount(r, httpapi.NewServer(svc, discard), httpserver.RequestValidator(spec, discard))
	return r
}

func azul() domain.Game {
	return domain.Game{
		Name:           "Azul",
		LocalizedNames: domain.LocalizedText{"fr": "Azul (VF)", "en": "Azul"},
		Publisher:      "Plan B Games",
		Players:        domain.Players{Min: 2, Max: 4},
		Duration:       domain.Duration{Min: 30, Max: 45},
		MinAge:         8,
		Categories:     []string{"abstract", "family"},
		Description:    domain.LocalizedText{"fr": "Jeu de tuiles.", "en": "Tile game."},
		Rules: []domain.RuleItem{
			{Section: domain.SectionTurnStep, Key: "turn-1", Order: 1, Optional: true, Text: domain.LocalizedText{"fr": "Prenez", "en": "Take"}},
			{Section: domain.SectionSetup, Key: "setup-2", Order: 2, Text: domain.LocalizedText{"fr": "Deux", "en": "Two"}},
			{Section: domain.SectionSetup, Key: "setup-1", Order: 1, PlayerCounts: []int{2}, Title: domain.LocalizedText{"fr": "Plateau"}, Text: domain.LocalizedText{"fr": "Un", "en": "One"}},
		},
		Warnings: []domain.LocalizedText{{"fr": "Attention", "en": "Careful"}},
	}
}

type call struct {
	path, lang, token string
}

func do(t *testing.T, h http.Handler, c call) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, c.path, nil)
	if c.lang != "" {
		req.Header.Set("Accept-Language", c.lang)
	}
	token := c.token
	if token == "" {
		token = "valid"
	}
	if token != "none" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var body map[string]any
	if rec.Body.Len() > 0 {
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body), rec.Body.String())
	}
	return rec, body
}

func TestGetGame(t *testing.T) {
	t.Parallel()
	h := newRouter(t, stubService{game: azul()})

	rec, body := do(t, h, call{path: "/games/42", lang: "en-US"})
	require.Equal(t, http.StatusOK, rec.Code)
	assert.Equal(t, "42", body["id"])
	assert.Equal(t, "Azul", body["name"])
	assert.Equal(t, float64(45), body["duration_minutes"])
	assert.Equal(t, "ready", body["rules_status"])
	assert.Equal(t, false, body["is_favorite"])
	assert.Equal(t, []any{
		map[string]any{"id": "abstract", "label": "Abstract"},
		map[string]any{"id": "family", "label": "Family"},
	}, body["categories"])

	_, body = do(t, h, call{path: "/games/42", lang: "fr-FR"})
	assert.Equal(t, "Azul (VF)", body["name"])
	assert.Equal(t, "Abstrait", body["categories"].([]any)[0].(map[string]any)["label"])
}

func TestGetGameRules(t *testing.T) {
	t.Parallel()
	h := newRouter(t, stubService{game: azul()})

	rec, body := do(t, h, call{path: "/games/42/rules", lang: "en"})
	require.Equal(t, http.StatusOK, rec.Code)
	setup := body["setup"].([]any)
	require.Len(t, setup, 2)
	first := setup[0].(map[string]any)
	assert.Equal(t, "setup-1", first["key"], "items are ordered")
	assert.Equal(t, "One", first["text"])
	assert.Equal(t, "Plateau", first["title"], "falls back to french when the title has no english")
	assert.Equal(t, []any{float64(2)}, first["player_counts"])
	assert.NotContains(t, first, "optional", "optional only exists on turn steps")
	assert.Equal(t, true, body["turn_steps"].([]any)[0].(map[string]any)["optional"])
	assert.Equal(t, []any{}, body["scoring"], "empty sections are empty arrays, not null")
	assert.Equal(t, "Tile game.", body["summary"].(map[string]any)["description"])
	assert.Equal(t, []any{"Careful"}, body["warnings"])
}

func TestLookupBarcode(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name     string
		svc      stubService
		lang     string
		wantCode int
		check    func(t *testing.T, body map[string]any)
	}{
		{
			name:     "found",
			svc:      stubService{lookup: app.LookupResult{Status: app.LookupFound, Game: azul()}},
			wantCode: http.StatusOK,
			check: func(t *testing.T, body map[string]any) {
				assert.Equal(t, "found", body["status"])
				assert.Equal(t, "Azul (VF)", body["game"].(map[string]any)["name"])
			},
		},
		{
			name: "ambiguous",
			svc: stubService{lookup: app.LookupResult{Status: app.LookupAmbiguous, Candidates: []domain.Candidate{
				{Name: "Azul", Year: 2017, GameID: 3}, {Name: "Azul Mini"},
			}}},
			wantCode: http.StatusOK,
			check: func(t *testing.T, body map[string]any) {
				assert.Equal(t, "ambiguous", body["status"])
				cands := body["candidates"].([]any)
				require.Len(t, cands, 2)
				assert.Equal(t, "3", cands[0].(map[string]any)["game_id"])
				assert.NotContains(t, cands[1], "game_id")
			},
		},
		{
			name:     "pending",
			svc:      stubService{lookup: app.LookupResult{Status: app.LookupPending, RetryAfter: 30 * time.Second}},
			wantCode: http.StatusAccepted,
			check: func(t *testing.T, body map[string]any) {
				assert.Equal(t, "pending", body["status"])
				assert.Equal(t, float64(30), body["retry_after_seconds"])
			},
		},
		{
			name:     "invalid barcode in english",
			svc:      stubService{err: domain.ErrBarcodeInvalid},
			lang:     "en",
			wantCode: http.StatusBadRequest,
			check: func(t *testing.T, body map[string]any) {
				assert.Equal(t, "barcode_invalid", body["code"])
				assert.Contains(t, body["message"], "not valid")
			},
		},
		{
			name:     "not found in french",
			svc:      stubService{err: domain.ErrBarcodeNotFound},
			lang:     "fr",
			wantCode: http.StatusNotFound,
			check: func(t *testing.T, body map[string]any) {
				assert.Equal(t, "barcode_not_found", body["code"])
				assert.Equal(t, "Jeu introuvable pour ce code-barre.", body["message"])
			},
		},
		{
			name:     "not a board game",
			svc:      stubService{err: domain.ErrNotBoardGame},
			wantCode: http.StatusNotFound,
			check: func(t *testing.T, body map[string]any) {
				assert.Equal(t, "not_board_game", body["code"])
			},
		},
		{
			name:     "unexpected error does not leak",
			svc:      stubService{err: errors.New("pq: connection refused to 10.0.0.3")},
			wantCode: http.StatusInternalServerError,
			check: func(t *testing.T, body map[string]any) {
				assert.Equal(t, "internal_error", body["code"])
				assert.NotContains(t, body["message"], "10.0.0.3")
			},
		},
		{
			name:     "deadline becomes 504",
			svc:      stubService{err: context.DeadlineExceeded},
			wantCode: http.StatusGatewayTimeout,
			check: func(t *testing.T, body map[string]any) {
				assert.Equal(t, "timeout", body["code"])
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			rec, body := do(t, newRouter(t, tt.svc), call{path: "/catalog/barcode/3558380077619", lang: tt.lang})
			assert.Equal(t, tt.wantCode, rec.Code)
			assert.Equal(t, "application/json", rec.Header().Get("Content-Type"))
			tt.check(t, body)
		})
	}
}

func TestBoundaryValidationAndAuth(t *testing.T) {
	t.Parallel()
	h := newRouter(t, stubService{game: azul(), err: nil})
	tests := []struct {
		name     string
		c        call
		wantCode int
		wantErr  string
	}{
		{"no token", call{path: "/games/42", token: "none"}, http.StatusUnauthorized, "unauthorized"},
		{"invalid token", call{path: "/games/42", token: "expired"}, http.StatusUnauthorized, "unauthorized"},
		{"game id must be numeric", call{path: "/games/abc"}, http.StatusBadRequest, "invalid_request"},
		{"barcode must be 12 or 13 digits", call{path: "/catalog/barcode/12AB"}, http.StatusBadRequest, "invalid_request"},
		{"search is not available yet", call{path: "/catalog/games?q=azul"}, http.StatusNotImplemented, "search_unavailable"},
		{"search requires q", call{path: "/catalog/games"}, http.StatusBadRequest, "invalid_request"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			rec, body := do(t, h, tt.c)
			assert.Equal(t, tt.wantCode, rec.Code)
			assert.Equal(t, tt.wantErr, body["code"])
			assert.NotEmpty(t, body["message"])
		})
	}
}

func TestGameNotFound(t *testing.T) {
	t.Parallel()
	h := newRouter(t, stubService{err: domain.ErrGameNotFound})
	for _, path := range []string{"/games/7", "/games/7/rules"} {
		rec, body := do(t, h, call{path: path, lang: "en"})
		assert.Equal(t, http.StatusNotFound, rec.Code, path)
		assert.Equal(t, "game_not_found", body["code"], path)
	}
}
