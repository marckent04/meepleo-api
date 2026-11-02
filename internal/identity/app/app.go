// Package app holds the identity use cases: guest sign-up, token refresh with
// rotation, logout and access token verification.
package app

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	"github.com/meepleo/meepleo-api/internal/identity/domain"
)

// Users stores accounts.
type Users interface {
	CreateGuest(ctx context.Context) (domain.User, error)
}

// NewRefreshToken describes a refresh token to store. An empty FamilyID
// starts a new family.
type NewRefreshToken struct {
	UserID    domain.UserID
	FamilyID  string
	Hash      []byte
	IssuedAt  time.Time
	ExpiresAt time.Time
}

// RefreshTokens stores refresh tokens.
type RefreshTokens interface {
	Create(ctx context.Context, t NewRefreshToken) (domain.RefreshToken, error)
	// ByHash returns domain.ErrInvalidRefreshToken when no token matches.
	ByHash(ctx context.Context, hash []byte) (domain.RefreshToken, error)
	// Revoke returns false when the token was already revoked.
	Revoke(ctx context.Context, id string, at time.Time) (bool, error)
	RevokeFamily(ctx context.Context, familyID string, at time.Time) error
	RevokeUser(ctx context.Context, userID domain.UserID, at time.Time) error
}

// TxManager runs fn in a transaction with stores bound to it.
type TxManager interface {
	WithinTx(ctx context.Context, fn func(ctx context.Context, users Users, tokens RefreshTokens) error) error
}

// AccessTokens issues and verifies short-lived access tokens.
type AccessTokens interface {
	Issue(userID domain.UserID, now time.Time) (string, error)
	// Verify returns domain.ErrInvalidAccessToken for any invalid token.
	Verify(token string, now time.Time) (domain.UserID, error)
}

// Tokens is the pair returned to the app.
type Tokens struct {
	AccessToken  string
	RefreshToken string
}

// Service implements the identity use cases.
type Service struct {
	tx         TxManager
	access     AccessTokens
	now        func() time.Time
	refreshTTL time.Duration
}

// NewService returns the identity service.
func NewService(tx TxManager, access AccessTokens, now func() time.Time, refreshTTL time.Duration) *Service {
	return &Service{tx: tx, access: access, now: now, refreshTTL: refreshTTL}
}

// Guest creates a guest account and signs it in.
func (s *Service) Guest(ctx context.Context) (Tokens, error) {
	now := s.now()
	raw, hash, err := newRefreshToken()
	if err != nil {
		return Tokens{}, err
	}
	var user domain.User
	err = s.tx.WithinTx(ctx, func(ctx context.Context, users Users, tokens RefreshTokens) error {
		var err error
		if user, err = users.CreateGuest(ctx); err != nil {
			return fmt.Errorf("create guest: %w", err)
		}
		if _, err := tokens.Create(ctx, NewRefreshToken{UserID: user.ID, Hash: hash, IssuedAt: now, ExpiresAt: now.Add(s.refreshTTL)}); err != nil {
			return fmt.Errorf("store refresh token: %w", err)
		}
		return nil
	})
	if err != nil {
		return Tokens{}, err
	}
	return s.tokens(user.ID, raw, now)
}

// Refresh exchanges a refresh token for a new pair (rotation). Presenting a
// token that was already rotated revokes its whole family.
func (s *Service) Refresh(ctx context.Context, rawToken string) (Tokens, error) {
	now := s.now()
	newRaw, newHash, err := newRefreshToken()
	if err != nil {
		return Tokens{}, err
	}

	var userID domain.UserID
	var reused bool
	err = s.tx.WithinTx(ctx, func(ctx context.Context, _ Users, tokens RefreshTokens) error {
		current, err := tokens.ByHash(ctx, hashToken(rawToken))
		if err != nil {
			return err
		}
		switch err := current.Check(now); {
		case errors.Is(err, domain.ErrRefreshTokenReused):
			// Commit the revocation, then report the reuse.
			reused = true
			return tokens.RevokeFamily(ctx, current.FamilyID, now)
		case err != nil:
			return err
		}
		revoked, err := tokens.Revoke(ctx, current.ID, now)
		if err != nil {
			return fmt.Errorf("revoke refresh token: %w", err)
		}
		if !revoked {
			// A concurrent refresh won the race with the same token: refuse
			// this one without punishing the family.
			return domain.ErrInvalidRefreshToken
		}
		if _, err := tokens.Create(ctx, NewRefreshToken{
			UserID: current.UserID, FamilyID: current.FamilyID, Hash: newHash, IssuedAt: now, ExpiresAt: now.Add(s.refreshTTL),
		}); err != nil {
			return fmt.Errorf("store refresh token: %w", err)
		}
		userID = current.UserID
		return nil
	})
	if err != nil {
		return Tokens{}, err
	}
	if reused {
		return Tokens{}, domain.ErrRefreshTokenReused
	}
	return s.tokens(userID, newRaw, now)
}

// Logout revokes every refresh token of the user (one device per user).
func (s *Service) Logout(ctx context.Context, userID domain.UserID) error {
	return s.tx.WithinTx(ctx, func(ctx context.Context, _ Users, tokens RefreshTokens) error {
		return tokens.RevokeUser(ctx, userID, s.now())
	})
}

// Authenticate verifies an access token and returns its user.
func (s *Service) Authenticate(_ context.Context, accessToken string) (domain.UserID, error) {
	return s.access.Verify(accessToken, s.now())
}

func (s *Service) tokens(userID domain.UserID, refresh string, now time.Time) (Tokens, error) {
	access, err := s.access.Issue(userID, now)
	if err != nil {
		return Tokens{}, fmt.Errorf("issue access token: %w", err)
	}
	return Tokens{AccessToken: access, RefreshToken: refresh}, nil
}

// newRefreshToken returns an opaque 256-bit token and its hash. Only the hash
// is stored, so a database leak does not leak usable tokens.
func newRefreshToken() (raw string, hash []byte, err error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", nil, fmt.Errorf("generate refresh token: %w", err)
	}
	raw = base64.RawURLEncoding.EncodeToString(b)
	return raw, hashToken(raw), nil
}

func hashToken(raw string) []byte {
	h := sha256.Sum256([]byte(raw))
	return h[:]
}
