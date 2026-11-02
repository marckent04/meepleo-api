package domain

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestRefreshTokenCheck(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		name  string
		token RefreshToken
		want  error
	}{
		{"active", RefreshToken{ExpiresAt: now.Add(time.Hour)}, nil},
		{"expired", RefreshToken{ExpiresAt: now}, ErrRefreshTokenExpired},
		{"revoked means reuse", RefreshToken{ExpiresAt: now.Add(time.Hour), RevokedAt: now.Add(-time.Minute)}, ErrRefreshTokenReused},
		{"revoked and expired is still reuse", RefreshToken{ExpiresAt: now.Add(-time.Hour), RevokedAt: now.Add(-2 * time.Hour)}, ErrRefreshTokenReused},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, tt.want, tt.token.Check(now))
		})
	}
}
