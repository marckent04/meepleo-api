package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/meepleo/meepleo-api/internal/platform/auth"
)

var discard = slog.New(slog.DiscardHandler)

func decodeError(t *testing.T, rec *httptest.ResponseRecorder) ErrorBody {
	t.Helper()
	assert.Equal(t, "application/json", rec.Header().Get("Content-Type"))
	var body ErrorBody
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	return body
}

func newTestRouter(health *Health) http.Handler {
	r := NewRouter(RouterConfig{
		Logger:         discard,
		RequestTimeout: time.Second,
		MaxBodyBytes:   16,
		Health:         health,
		Spec:           []byte("openapi: 3.0.3"),
	})
	r.Get("/panic", func(http.ResponseWriter, *http.Request) { panic("boom") })
	r.Post("/echo", func(w http.ResponseWriter, r *http.Request) {
		if _, err := io.ReadAll(r.Body); err != nil {
			WritePlatformError(w, r, http.StatusRequestEntityTooLarge, CodeRequestTooLarge)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	r.Get("/deadline", func(w http.ResponseWriter, r *http.Request) {
		_, hasDeadline := r.Context().Deadline()
		if !hasDeadline {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	return r
}

func TestRouter(t *testing.T) {
	t.Parallel()
	h := newTestRouter(NewHealth(time.Second, nil))

	t.Run("unknown route returns translated JSON 404", func(t *testing.T) {
		t.Parallel()
		req := httptest.NewRequest(http.MethodGet, "/nope", nil)
		req.Header.Set("Accept-Language", "en")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		assert.Equal(t, http.StatusNotFound, rec.Code)
		body := decodeError(t, rec)
		assert.Equal(t, CodeNotFound, body.Code)
		assert.Equal(t, "Resource not found.", body.Message)
	})

	t.Run("panic is recovered as 500 in french by default", func(t *testing.T) {
		t.Parallel()
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/panic", nil))
		assert.Equal(t, http.StatusInternalServerError, rec.Code)
		body := decodeError(t, rec)
		assert.Equal(t, CodeInternal, body.Code)
		assert.Contains(t, body.Message, "erreur inattendue")
	})

	t.Run("request id is generated and echoed", func(t *testing.T) {
		t.Parallel()
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))
		assert.Len(t, rec.Header().Get(RequestIDHeader), 32)
	})

	t.Run("valid incoming request id is reused, invalid one replaced", func(t *testing.T) {
		t.Parallel()
		req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
		req.Header.Set(RequestIDHeader, "client-req-123")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		assert.Equal(t, "client-req-123", rec.Header().Get(RequestIDHeader))

		req.Header.Set(RequestIDHeader, "bad id\n")
		rec = httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		assert.NotEqual(t, "bad id\n", rec.Header().Get(RequestIDHeader))
	})

	t.Run("oversized body is rejected", func(t *testing.T) {
		t.Parallel()
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/echo", strings.NewReader(strings.Repeat("x", 64))))
		assert.Equal(t, http.StatusRequestEntityTooLarge, rec.Code)
		assert.Equal(t, CodeRequestTooLarge, decodeError(t, rec).Code)
	})

	t.Run("request context has a deadline", func(t *testing.T) {
		t.Parallel()
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/deadline", nil))
		assert.Equal(t, http.StatusNoContent, rec.Code)
	})

	t.Run("docs are served", func(t *testing.T) {
		t.Parallel()
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/docs", nil))
		assert.Equal(t, http.StatusOK, rec.Code)
		assert.Contains(t, rec.Body.String(), "swagger-ui")
	})
}

func TestReadiness(t *testing.T) {
	t.Parallel()
	ok := func(context.Context) error { return nil }
	ko := func(context.Context) error { return errors.New("down") }

	tests := []struct {
		name   string
		checks map[string]Check
		drain  bool
		want   int
	}{
		{"all ok", map[string]Check{"postgres": ok, "redis": ok}, false, http.StatusOK},
		{"one dependency down", map[string]Check{"postgres": ok, "redis": ko}, false, http.StatusServiceUnavailable},
		{"draining", map[string]Check{"postgres": ok}, true, http.StatusServiceUnavailable},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			health := NewHealth(time.Second, tt.checks)
			if tt.drain {
				health.Drain()
			}
			rec := httptest.NewRecorder()
			newTestRouter(health).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/readyz", nil))
			assert.Equal(t, tt.want, rec.Code)
			assert.NotContains(t, rec.Body.String(), "down", "dependency errors must not leak")
		})
	}
}

const validatorSpec = `
openapi: 3.0.3
info: {title: test, version: "1"}
security: [{bearerAuth: []}]
paths:
  /public/{n}:
    get:
      security: []
      parameters:
        - {name: n, in: path, required: true, schema: {type: integer}}
      responses: {"204": {description: ok}}
  /private:
    get:
      responses: {"204": {description: ok}}
components:
  securitySchemes:
    bearerAuth: {type: http, scheme: bearer}
`

type stubAuthenticator struct{}

func (stubAuthenticator) Verify(_ context.Context, token string) (auth.Principal, error) {
	if token == "good" {
		return auth.Principal{UserID: "u1"}, nil
	}
	return auth.Principal{}, errors.New("invalid")
}

func TestRequestValidator(t *testing.T) {
	t.Parallel()
	spec, err := LoadSpec(context.Background(), []byte(validatorSpec))
	require.NoError(t, err)

	r := NewRouter(RouterConfig{Logger: discard, RequestTimeout: time.Second, MaxBodyBytes: 1024, Authenticator: stubAuthenticator{}})
	r.Group(func(r chi.Router) {
		r.Use(RequestValidator(spec, discard))
		noContent := func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }
		r.Get("/public/{n}", noContent)
		r.Get("/private", noContent)
	})

	tests := []struct {
		name     string
		path     string
		token    string
		wantCode int
		wantErr  string
	}{
		{"public route without token", "/public/1", "", http.StatusNoContent, ""},
		{"public route with expired token still works", "/public/1", "bad", http.StatusNoContent, ""},
		{"invalid path parameter", "/public/abc", "", http.StatusBadRequest, CodeInvalidRequest},
		{"private route without token", "/private", "", http.StatusUnauthorized, CodeUnauthorized},
		{"private route with invalid token", "/private", "bad", http.StatusUnauthorized, CodeUnauthorized},
		{"private route with valid token", "/private", "good", http.StatusNoContent, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			if tt.token != "" {
				req.Header.Set("Authorization", "Bearer "+tt.token)
			}
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)
			assert.Equal(t, tt.wantCode, rec.Code)
			if tt.wantErr != "" {
				assert.Equal(t, tt.wantErr, decodeError(t, rec).Code)
			}
		})
	}
}
