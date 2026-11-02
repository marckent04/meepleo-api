package jwt

import (
	"testing"
	"time"

	gojwt "github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/meepleo/meepleo-api/internal/identity/domain"
)

var now = time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)

func cfg() Config {
	return Config{Secret: []byte("0123456789abcdef0123456789abcdef"), Issuer: "meepleo-api", Audience: "meepleo-app", TTL: 15 * time.Minute}
}

func TestIssueAndVerify(t *testing.T) {
	t.Parallel()
	tokens := New(cfg())
	token, err := tokens.Issue("user-1", now)
	require.NoError(t, err)

	got, err := tokens.Verify(token, now.Add(10*time.Minute))
	require.NoError(t, err)
	assert.Equal(t, domain.UserID("user-1"), got)
}

func TestVerifyRejects(t *testing.T) {
	t.Parallel()
	valid, err := New(cfg()).Issue("user-1", now)
	require.NoError(t, err)

	other := cfg()
	other.Secret = []byte("ffffffffffffffffffffffffffffffff")
	wrongSecret, _ := New(other).Issue("user-1", now)

	other = cfg()
	other.Audience = "someone-else"
	wrongAudience, _ := New(other).Issue("user-1", now)

	none, _ := gojwt.NewWithClaims(gojwt.SigningMethodNone, gojwt.RegisteredClaims{
		Subject: "user-1", Issuer: "meepleo-api", Audience: gojwt.ClaimStrings{"meepleo-app"},
		ExpiresAt: gojwt.NewNumericDate(now.Add(time.Hour)),
	}).SignedString(gojwt.UnsafeAllowNoneSignatureType)

	tests := []struct {
		name  string
		token string
		at    time.Time
	}{
		{"expired", valid, now.Add(16 * time.Minute)},
		{"wrong secret", wrongSecret, now},
		{"wrong audience", wrongAudience, now},
		{"alg none", none, now},
		{"garbage", "not-a-jwt", now},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			_, err := New(cfg()).Verify(tt.token, tt.at)
			require.ErrorIs(t, err, domain.ErrInvalidAccessToken)
		})
	}
}
