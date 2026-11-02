package claudeapi

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/meepleo/meepleo-api/internal/catalog/domain"
	"github.com/meepleo/meepleo-api/internal/platform/httpclient"
)

const foundAnswer = `{
  "status": "found", "confidence": "high", "edition_label": "Édition 2017",
  "game": {
    "name": "Azul", "localized_names": {"fr": "Azul", "en": "Azul"},
    "edition": null, "publisher": "Plan B Games", "year": 2017, "bgg_id": 230802,
    "players_min": 2, "players_max": 4, "players_recommended": [2, 3],
    "min_age": 8, "duration_min": 30, "duration_max": 45,
    "categories": ["abstract", "family"],
    "description": {"fr": "Jeu de tuiles.", "en": "Tile game."},
    "turn_summary": {"fr": "Prenez des tuiles.", "en": "Take tiles."},
    "end_timing": null, "end_winner": null
  },
  "rules": [
    {"section": "setup", "key": "setup-1", "sort_order": 1, "player_counts": [2], "optional": null, "title": null,
     "text": {"fr": "Placez 5 fabriques.", "en": "Place 5 factories."}},
    {"section": "special_rule", "key": "rule-1", "sort_order": null, "player_counts": null, "optional": null,
     "title": {"fr": "Premier joueur", "en": "First player"}, "text": {"fr": "Le jeton...", "en": "The token..."}}
  ],
  "sources": [{"title": "BGG", "url": "https://boardgamegeek.com/boardgame/230802"}],
  "warnings": [{"fr": "Vérifiez la variante.", "en": "Check the variant."}],
  "candidates": []
}`

func message(stopReason string, answer string) map[string]any {
	content := []any{
		map[string]any{"type": "text", "text": "Let me search."},
		map[string]any{"type": "server_tool_use", "id": "srvtoolu_1", "name": "web_search", "input": map[string]any{"query": "3558380077619"}},
		map[string]any{"type": "web_search_tool_result", "tool_use_id": "srvtoolu_1", "content": []any{}},
	}
	if answer != "" {
		content = append(content, map[string]any{"type": "text", "text": answer})
	}
	return map[string]any{
		"id": "msg_1", "type": "message", "role": "assistant", "model": "claude-opus-5-5",
		"content": content, "stop_reason": stopReason,
		"usage": map[string]any{"input_tokens": 10, "output_tokens": 10},
	}
}

// fakeAnthropic serves the given responses in order and records requests.
type fakeAnthropic struct {
	responses []func(w http.ResponseWriter)
	calls     atomic.Int32
	lastBody  atomic.Value
	lastBeta  atomic.Value
}

func (f *fakeAnthropic) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	n := int(f.calls.Add(1)) - 1
	body, _ := io.ReadAll(r.Body)
	f.lastBody.Store(body)
	f.lastBeta.Store(r.Header.Get("anthropic-beta"))
	if n >= len(f.responses) {
		n = len(f.responses) - 1
	}
	f.responses[n](w)
}

func jsonResponse(status int, v any) func(w http.ResponseWriter) {
	return func(w http.ResponseWriter) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(v)
	}
}

func newTestGenerator(t *testing.T, f *fakeAnthropic) *Generator {
	t.Helper()
	srv := httptest.NewServer(f)
	t.Cleanup(srv.Close)
	client := httpclient.New(httpclient.Config{
		Name: "claude", Timeout: 5 * time.Second, MaxRetries: 2, RetryNonIdempotent: true,
		BaseBackoff: time.Millisecond, MaxBackoff: 2 * time.Millisecond,
	})
	return New(Config{APIKey: "sk-test", BaseURL: srv.URL, Model: "claude-opus-5-5"}, client)
}

func TestGenerateFound(t *testing.T) {
	t.Parallel()
	f := &fakeAnthropic{responses: []func(http.ResponseWriter){jsonResponse(200, message("end_turn", foundAnswer))}}
	gen, err := newTestGenerator(t, f).Generate(context.Background(), "3558380077619")
	require.NoError(t, err)

	assert.Equal(t, domain.BarcodeFound, gen.Status)
	assert.Equal(t, "Édition 2017", gen.EditionLabel)
	assert.Equal(t, "claude-opus-5-5", gen.Model)
	assert.JSONEq(t, foundAnswer, string(gen.Raw), "only the final answer is kept, not the text between searches")

	g := gen.Game
	assert.Equal(t, "Azul", g.Name)
	assert.Equal(t, domain.ConfidenceHigh, g.Confidence)
	assert.Equal(t, domain.Players{Min: 2, Max: 4, Recommended: []int{2, 3}}, g.Players)
	assert.Equal(t, domain.Duration{Min: 30, Max: 45}, g.Duration)
	assert.Equal(t, []string{"fr", "en"}, g.Languages)
	require.Len(t, g.Rules, 2)
	assert.Equal(t, []int{2}, g.Rules[0].PlayerCounts)
	assert.Equal(t, "First player", g.Rules[1].Title.Resolve("en"))
	assert.Len(t, g.Sources, 1)
	assert.Len(t, g.Warnings, 1)

	_, err = gen.Validate()
	require.NoError(t, err, "the mapped sheet must satisfy the domain invariants")

	var req map[string]any
	require.NoError(t, json.Unmarshal(f.lastBody.Load().([]byte), &req))
	assert.Equal(t, "claude-opus-5-5", req["model"])
	assert.Equal(t, "default", req["fallbacks"])
	tools := req["tools"].([]any)
	assert.Equal(t, "web_search_20260209", tools[0].(map[string]any)["type"])
	format := req["output_config"].(map[string]any)["format"].(map[string]any)
	assert.Equal(t, "json_schema", format["type"])
	assert.Contains(t, f.lastBeta.Load().(string), "server-side-fallback-2026-07-01")
}

func TestGenerateOutcomes(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		responses  []func(http.ResponseWriter)
		wantStatus domain.BarcodeStatus
		wantErr    error
		wantAnyErr bool
		wantCalls  int32
	}{
		{
			name:       "ambiguous",
			responses:  []func(http.ResponseWriter){jsonResponse(200, message("end_turn", `{"status":"ambiguous","confidence":"medium","edition_label":null,"game":null,"rules":[],"sources":[],"warnings":[],"candidates":[{"name":"Azul","edition":null,"publisher":null,"year":2017},{"name":"Azul Mini","edition":null,"publisher":null,"year":null}]}`))},
			wantStatus: domain.BarcodeAmbiguous,
			wantCalls:  1,
		},
		{
			name:       "not a board game",
			responses:  []func(http.ResponseWriter){jsonResponse(200, message("end_turn", `{"status":"not_board_game","confidence":"high","edition_label":null,"game":null,"rules":[],"sources":[],"warnings":[],"candidates":[]}`))},
			wantStatus: domain.BarcodeNotBoardGame,
			wantCalls:  1,
		},
		{
			name: "pause_turn is resumed",
			responses: []func(http.ResponseWriter){
				jsonResponse(200, message("pause_turn", "")),
				jsonResponse(200, message("end_turn", foundAnswer)),
			},
			wantStatus: domain.BarcodeFound,
			wantCalls:  2,
		},
		{
			name: "overloaded is retried by the resilient client",
			responses: []func(http.ResponseWriter){
				jsonResponse(529, map[string]any{"type": "error", "error": map[string]any{"type": "overloaded_error", "message": "overloaded"}}),
				jsonResponse(200, message("end_turn", foundAnswer)),
			},
			wantStatus: domain.BarcodeFound,
			wantCalls:  2,
		},
		{
			name:      "persistent outage is reported as unavailable",
			responses: []func(http.ResponseWriter){jsonResponse(503, map[string]any{"type": "error", "error": map[string]any{"type": "api_error", "message": "down"}})},
			wantErr:   domain.ErrGenerationUnavailable,
			wantCalls: 3,
		},
		{
			name:       "bad request is not retried",
			responses:  []func(http.ResponseWriter){jsonResponse(400, map[string]any{"type": "error", "error": map[string]any{"type": "invalid_request_error", "message": "bad"}})},
			wantAnyErr: true,
			wantCalls:  1,
		},
		{
			name:       "refusal",
			responses:  []func(http.ResponseWriter){jsonResponse(200, message("refusal", ""))},
			wantAnyErr: true,
			wantCalls:  1,
		},
		{
			name:       "truncated answer",
			responses:  []func(http.ResponseWriter){jsonResponse(200, message("max_tokens", `{"status":"fo`))},
			wantAnyErr: true,
			wantCalls:  1,
		},
		{
			name:       "found without game",
			responses:  []func(http.ResponseWriter){jsonResponse(200, message("end_turn", `{"status":"found","confidence":"high","edition_label":null,"game":null,"rules":[],"sources":[],"warnings":[],"candidates":[]}`))},
			wantAnyErr: true,
			wantCalls:  1,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			f := &fakeAnthropic{responses: tt.responses}
			gen, err := newTestGenerator(t, f).Generate(context.Background(), "3558380077619")
			switch {
			case tt.wantErr != nil:
				require.ErrorIs(t, err, tt.wantErr)
			case tt.wantAnyErr:
				require.Error(t, err)
			default:
				require.NoError(t, err)
				assert.Equal(t, tt.wantStatus, gen.Status)
			}
			assert.Equal(t, tt.wantCalls, f.calls.Load())
		})
	}
}

func TestOutputSchemaIsStrict(t *testing.T) {
	t.Parallel()
	// Structured outputs require additionalProperties:false and every
	// property listed in required, on every object.
	var walk func(path string, s map[string]any)
	walk = func(path string, s map[string]any) {
		if s["type"] == "object" {
			assert.Equal(t, false, s["additionalProperties"], path)
			props := s["properties"].(map[string]any)
			assert.Len(t, s["required"], len(props), path)
			for k, v := range props {
				walk(path+"."+k, v.(map[string]any))
			}
		}
		if items, ok := s["items"].(map[string]any); ok {
			walk(path+"[]", items)
		}
		if anyOf, ok := s["anyOf"].([]any); ok {
			for _, v := range anyOf {
				walk(path, v.(map[string]any))
			}
		}
	}
	walk("$", outputSchema())
}
