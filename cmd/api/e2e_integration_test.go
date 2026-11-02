//go:build integration

package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/meepleo/meepleo-api/internal/catalog"
	"github.com/meepleo/meepleo-api/internal/platform/config"
	"github.com/meepleo/meepleo-api/internal/platform/httpclient"
	"github.com/meepleo/meepleo-api/internal/platform/postgres/postgrestest"
	"github.com/meepleo/meepleo-api/internal/platform/redis/redistest"
	"github.com/meepleo/meepleo-api/migrations"
)

// fakeAnthropic answers every Messages call with a found sheet.
func fakeAnthropic(t *testing.T) *httptest.Server {
	t.Helper()
	answer := `{"status":"found","confidence":"high","edition_label":null,
	  "game":{"name":"Azul","localized_names":{"fr":"Azul","en":"Azul"},"edition":null,"publisher":"Plan B Games",
	    "year":2017,"bgg_id":230802,"players_min":2,"players_max":4,"players_recommended":[2],"min_age":8,
	    "duration_min":30,"duration_max":45,"categories":["abstract"],
	    "description":{"fr":"Jeu de tuiles.","en":"Tile game."},"turn_summary":null,"end_timing":null,"end_winner":null},
	  "rules":[{"section":"setup","key":"setup-1","sort_order":1,"player_counts":null,"optional":null,"title":null,
	    "text":{"fr":"Placez les fabriques.","en":"Place the factories."}}],
	  "sources":[],"warnings":[],"candidates":[]}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"id": "msg_1", "type": "message", "role": "assistant", "model": "claude-opus-5-5",
			"content":     []any{map[string]any{"type": "text", "text": answer}},
			"stop_reason": "end_turn", "usage": map[string]any{"input_tokens": 1, "output_tokens": 1},
		})
	}))
	t.Cleanup(srv.Close)
	return srv
}

type client struct {
	t     *testing.T
	base  string
	token string
}

func (c *client) do(method, path, body string) (int, map[string]any) {
	c.t.Helper()
	req, err := http.NewRequestWithContext(context.Background(), method, c.base+path, strings.NewReader(body))
	require.NoError(c.t, err)
	req.Header.Set("Accept-Language", "en-US")
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	resp, err := http.DefaultClient.Do(req) //nolint:forbidigo // test client
	require.NoError(c.t, err)
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var out map[string]any
	if len(raw) > 0 && strings.HasPrefix(resp.Header.Get("Content-Type"), "application/json") {
		require.NoError(c.t, json.Unmarshal(raw, &out), string(raw))
	}
	return resp.StatusCode, out
}

func TestEndToEnd(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pool := postgrestest.New(t, func(ctx context.Context, db *sql.DB) error {
		return migrations.Up(ctx, db, slog.New(slog.DiscardHandler))
	})
	rdb := redistest.New(t).Client
	anthropic := fakeAnthropic(t)

	cfg, err := config.Load(func(k string) string {
		return map[string]string{
			"DATABASE_URL": "unused-pool-is-injected",
			"REDIS_URL":    "redis://unused",
			"JWT_SECRET":   "0123456789abcdef0123456789abcdef",
		}[k]
	})
	require.NoError(t, err)
	log := slog.New(slog.DiscardHandler)

	handler, _, err := newHandler(ctx, cfg, pool, rdb, log)
	require.NoError(t, err)
	srv := httptest.NewServer(handler)
	defer srv.Close()

	// The worker, wired like cmd/worker but against the fake Anthropic API.
	worker := catalog.New(catalog.Deps{Pool: pool, Redis: rdb, Logger: log}).NewWorker(catalog.WorkerConfig{
		Generator: catalog.NewClaudeGenerator(catalog.ClaudeConfig{APIKey: "sk-test", BaseURL: anthropic.URL, Model: "claude-opus-5-5"},
			httpclient.New(httpclient.Config{Name: "claude", Timeout: 10 * time.Second})),
		DailyBudget: 10, Lease: time.Minute, MaxAttempts: 3, RetryAfter: time.Hour, PollInterval: 50 * time.Millisecond,
	})

	c := &client{t: t, base: srv.URL}

	status, _ := c.do(http.MethodGet, "/catalog/barcode/3558380077619", "")
	require.Equal(t, http.StatusUnauthorized, status, "catalog routes require a token")

	status, tokens := c.do(http.MethodPost, "/auth/guest", "")
	require.Equal(t, http.StatusOK, status)
	c.token = tokens["access_token"].(string)
	refresh := tokens["refresh_token"].(string)

	status, body := c.do(http.MethodGet, "/catalog/barcode/3558380077619", "")
	require.Equal(t, http.StatusAccepted, status)
	assert.Equal(t, "pending", body["status"])

	workerDone := make(chan error, 1)
	go func() { workerDone <- worker.Run(ctx) }()

	var gameID string
	require.Eventually(t, func() bool {
		status, body = c.do(http.MethodGet, "/catalog/barcode/3558380077619", "")
		if status != http.StatusOK {
			return false
		}
		gameID = body["game"].(map[string]any)["id"].(string)
		return true
	}, 20*time.Second, 100*time.Millisecond, "the worker should generate the sheet")
	assert.Equal(t, "found", body["status"])

	status, body = c.do(http.MethodGet, "/games/"+gameID, "")
	require.Equal(t, http.StatusOK, status)
	assert.Equal(t, "Azul", body["name"])
	assert.Equal(t, "ready", body["rules_status"])

	status, body = c.do(http.MethodGet, "/games/"+gameID+"/rules", "")
	require.Equal(t, http.StatusOK, status)
	assert.Equal(t, "Place the factories.", body["setup"].([]any)[0].(map[string]any)["text"])

	status, body = c.do(http.MethodPost, "/auth/refresh", `{"refresh_token":"`+refresh+`"}`)
	require.Equal(t, http.StatusOK, status)
	assert.NotEqual(t, refresh, body["refresh_token"])
	status, body = c.do(http.MethodPost, "/auth/refresh", `{"refresh_token":"`+refresh+`"}`)
	require.Equal(t, http.StatusUnauthorized, status)
	assert.Equal(t, "refresh_token_reused", body["code"])

	status, _ = c.do(http.MethodGet, "/readyz", "")
	assert.Equal(t, http.StatusOK, status)
	status, _ = c.do(http.MethodGet, "/docs", "")
	assert.Equal(t, http.StatusOK, status)

	cancel()
	require.NoError(t, <-workerDone, "the worker stops cleanly on cancellation")
}
