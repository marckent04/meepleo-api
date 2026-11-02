package auth

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

type fakeAuthenticator struct{}

func (fakeAuthenticator) Verify(_ context.Context, token string) (Principal, error) {
	if token == "good" {
		return Principal{UserID: "u1"}, nil
	}
	return Principal{}, errors.New("bad token")
}

func TestMiddleware(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name     string
		header   string
		wantUser string
	}{
		{"no header", "", ""},
		{"valid", "Bearer good", "u1"},
		{"case insensitive scheme", "bearer good", "u1"},
		{"invalid token is ignored", "Bearer bad", ""},
		{"wrong scheme", "Basic good", ""},
	}
	log := slog.New(slog.DiscardHandler)
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			var got string
			h := Middleware(fakeAuthenticator{}, log)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if p, ok := FromContext(r.Context()); ok {
					got = p.UserID
				}
				w.WriteHeader(http.StatusNoContent)
			}))
			req := httptest.NewRequest(http.MethodGet, "/", nil)
			if tt.header != "" {
				req.Header.Set("Authorization", tt.header)
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			assert.Equal(t, http.StatusNoContent, rec.Code, "middleware must never reject")
			assert.Equal(t, tt.wantUser, got)
		})
	}
}
