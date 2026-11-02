package app

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/meepleo/meepleo-api/internal/identity/domain"
)

var now = time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)

// store is an in-memory Users + RefreshTokens + TxManager.
type store struct {
	users  []domain.User
	tokens []storedToken
	seq    int
}

type storedToken struct {
	domain.RefreshToken
	hash []byte
}

func (s *store) WithinTx(ctx context.Context, fn func(context.Context, Users, RefreshTokens) error) error {
	snapshot := *s
	snapshot.users = append([]domain.User(nil), s.users...)
	snapshot.tokens = append([]storedToken(nil), s.tokens...)
	if err := fn(ctx, &snapshot, &snapshot); err != nil {
		return err
	}
	*s = snapshot
	return nil
}

func (s *store) next() string { s.seq++; return fmt.Sprintf("id-%d", s.seq) }

func (s *store) CreateGuest(context.Context) (domain.User, error) {
	u := domain.User{ID: domain.UserID(s.next()), Kind: domain.KindGuest, CreatedAt: now}
	s.users = append(s.users, u)
	return u, nil
}

func (s *store) Create(_ context.Context, t NewRefreshToken) (domain.RefreshToken, error) {
	family := t.FamilyID
	if family == "" {
		family = s.next()
	}
	rt := domain.RefreshToken{ID: s.next(), UserID: t.UserID, FamilyID: family, IssuedAt: t.IssuedAt, ExpiresAt: t.ExpiresAt}
	s.tokens = append(s.tokens, storedToken{RefreshToken: rt, hash: t.Hash})
	return rt, nil
}

func (s *store) ByHash(_ context.Context, hash []byte) (domain.RefreshToken, error) {
	for _, t := range s.tokens {
		if bytes.Equal(t.hash, hash) {
			return t.RefreshToken, nil
		}
	}
	return domain.RefreshToken{}, domain.ErrInvalidRefreshToken
}

func (s *store) Revoke(_ context.Context, id string, at time.Time) (bool, error) {
	for i, t := range s.tokens {
		if t.ID == id && t.RevokedAt.IsZero() {
			s.tokens[i].RevokedAt = at
			return true, nil
		}
	}
	return false, nil
}

func (s *store) RevokeFamily(_ context.Context, family string, at time.Time) error {
	for i, t := range s.tokens {
		if t.FamilyID == family && t.RevokedAt.IsZero() {
			s.tokens[i].RevokedAt = at
		}
	}
	return nil
}

func (s *store) RevokeUser(_ context.Context, user domain.UserID, at time.Time) error {
	for i, t := range s.tokens {
		if t.UserID == user && t.RevokedAt.IsZero() {
			s.tokens[i].RevokedAt = at
		}
	}
	return nil
}

func (s *store) active() int {
	n := 0
	for _, t := range s.tokens {
		if t.RevokedAt.IsZero() {
			n++
		}
	}
	return n
}

// fakeAccess issues "access:<user>" tokens.
type fakeAccess struct{}

func (fakeAccess) Issue(userID domain.UserID, _ time.Time) (string, error) {
	return "access:" + string(userID), nil
}

func (fakeAccess) Verify(token string, _ time.Time) (domain.UserID, error) {
	if id, ok := bytes.CutPrefix([]byte(token), []byte("access:")); ok {
		return domain.UserID(id), nil
	}
	return "", domain.ErrInvalidAccessToken
}

type clock struct{ t time.Time }

func (c *clock) now() time.Time { return c.t }

func newService() (*Service, *store, *clock) {
	s := &store{}
	c := &clock{t: now}
	return NewService(s, fakeAccess{}, c.now, 30*24*time.Hour), s, c
}

func TestGuest(t *testing.T) {
	t.Parallel()
	svc, st, _ := newService()

	tokens, err := svc.Guest(context.Background())
	require.NoError(t, err)
	require.Len(t, st.users, 1)
	assert.Equal(t, "access:"+string(st.users[0].ID), tokens.AccessToken)
	assert.Len(t, tokens.RefreshToken, 43, "256 bits, base64url")
	require.Len(t, st.tokens, 1)
	assert.NotContains(t, string(st.tokens[0].hash), tokens.RefreshToken, "only the hash is stored")
	assert.Equal(t, now.Add(30*24*time.Hour), st.tokens[0].ExpiresAt)

	userID, err := svc.Authenticate(context.Background(), tokens.AccessToken)
	require.NoError(t, err)
	assert.Equal(t, st.users[0].ID, userID)
}

func TestRefresh(t *testing.T) {
	t.Parallel()

	t.Run("rotation", func(t *testing.T) {
		t.Parallel()
		svc, st, _ := newService()
		first, err := svc.Guest(context.Background())
		require.NoError(t, err)

		second, err := svc.Refresh(context.Background(), first.RefreshToken)
		require.NoError(t, err)
		assert.NotEqual(t, first.RefreshToken, second.RefreshToken)
		assert.Equal(t, first.AccessToken, second.AccessToken, "same user")
		assert.Equal(t, 1, st.active(), "the old token is revoked")
		assert.Equal(t, st.tokens[0].FamilyID, st.tokens[1].FamilyID, "rotation keeps the family")
	})

	t.Run("unknown token", func(t *testing.T) {
		t.Parallel()
		svc, _, _ := newService()
		_, err := svc.Refresh(context.Background(), "nope")
		require.ErrorIs(t, err, domain.ErrInvalidRefreshToken)
	})

	t.Run("expired token", func(t *testing.T) {
		t.Parallel()
		svc, _, c := newService()
		first, err := svc.Guest(context.Background())
		require.NoError(t, err)
		c.t = now.Add(31 * 24 * time.Hour)
		_, err = svc.Refresh(context.Background(), first.RefreshToken)
		require.ErrorIs(t, err, domain.ErrRefreshTokenExpired)
	})

	t.Run("reuse revokes the whole family", func(t *testing.T) {
		t.Parallel()
		svc, st, _ := newService()
		first, err := svc.Guest(context.Background())
		require.NoError(t, err)
		second, err := svc.Refresh(context.Background(), first.RefreshToken)
		require.NoError(t, err)

		_, err = svc.Refresh(context.Background(), first.RefreshToken) // stolen copy
		require.ErrorIs(t, err, domain.ErrRefreshTokenReused)
		assert.Zero(t, st.active(), "the revocation is committed despite the error")

		_, err = svc.Refresh(context.Background(), second.RefreshToken)
		require.ErrorIs(t, err, domain.ErrRefreshTokenReused, "the legitimate token is revoked too")
	})
}

func TestLogout(t *testing.T) {
	t.Parallel()
	svc, st, _ := newService()
	tokens, err := svc.Guest(context.Background())
	require.NoError(t, err)

	require.NoError(t, svc.Logout(context.Background(), st.users[0].ID))
	assert.Zero(t, st.active())
	_, err = svc.Refresh(context.Background(), tokens.RefreshToken)
	require.Error(t, err)
}

func TestAuthenticateRejectsInvalidToken(t *testing.T) {
	t.Parallel()
	svc, _, _ := newService()
	_, err := svc.Authenticate(context.Background(), "garbage")
	require.True(t, errors.Is(err, domain.ErrInvalidAccessToken))
}
