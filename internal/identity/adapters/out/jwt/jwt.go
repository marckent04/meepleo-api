// Package jwt issues and verifies access tokens as HS256 JWTs.
//
// HS256 with a shared secret is enough while a single service verifies the
// tokens. If a module is extracted into its own service, switch to an
// asymmetric algorithm (EdDSA) and publish a JWKS so other services can verify
// without holding the signing secret (ADR 0009).
package jwt

import (
	"fmt"
	"time"

	gojwt "github.com/golang-jwt/jwt/v5"

	"github.com/meepleo/meepleo-api/internal/identity/domain"
)

// Config configures the tokens.
type Config struct {
	Secret   []byte
	Issuer   string
	Audience string
	TTL      time.Duration
}

// Tokens implements app.AccessTokens.
type Tokens struct {
	cfg Config
}

// New returns the access token issuer and verifier.
func New(cfg Config) *Tokens {
	return &Tokens{cfg: cfg}
}

// Issue signs an access token for userID.
func (t *Tokens) Issue(userID domain.UserID, now time.Time) (string, error) {
	claims := gojwt.RegisteredClaims{
		Subject:   string(userID),
		Issuer:    t.cfg.Issuer,
		Audience:  gojwt.ClaimStrings{t.cfg.Audience},
		IssuedAt:  gojwt.NewNumericDate(now),
		ExpiresAt: gojwt.NewNumericDate(now.Add(t.cfg.TTL)),
	}
	signed, err := gojwt.NewWithClaims(gojwt.SigningMethodHS256, claims).SignedString(t.cfg.Secret)
	if err != nil {
		return "", fmt.Errorf("sign access token: %w", err)
	}
	return signed, nil
}

// Verify checks the signature, algorithm, issuer, audience and expiry. Every
// failure is reported as domain.ErrInvalidAccessToken; the cause is wrapped
// for logs.
func (t *Tokens) Verify(token string, now time.Time) (domain.UserID, error) {
	var claims gojwt.RegisteredClaims
	_, err := gojwt.ParseWithClaims(token, &claims,
		func(*gojwt.Token) (any, error) { return t.cfg.Secret, nil },
		gojwt.WithValidMethods([]string{gojwt.SigningMethodHS256.Alg()}),
		gojwt.WithIssuer(t.cfg.Issuer),
		gojwt.WithAudience(t.cfg.Audience),
		gojwt.WithExpirationRequired(),
		gojwt.WithLeeway(30*time.Second),
		gojwt.WithTimeFunc(func() time.Time { return now }),
	)
	if err != nil {
		return "", fmt.Errorf("%w: %w", domain.ErrInvalidAccessToken, err)
	}
	if claims.Subject == "" {
		return "", fmt.Errorf("%w: missing subject", domain.ErrInvalidAccessToken)
	}
	return domain.UserID(claims.Subject), nil
}
