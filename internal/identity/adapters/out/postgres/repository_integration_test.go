//go:build integration

package postgres_test

import (
	"context"
	"database/sql"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/meepleo/meepleo-api/internal/identity/adapters/out/jwt"
	"github.com/meepleo/meepleo-api/internal/identity/adapters/out/postgres"
	"github.com/meepleo/meepleo-api/internal/identity/app"
	"github.com/meepleo/meepleo-api/internal/identity/domain"
	"github.com/meepleo/meepleo-api/internal/platform/postgres/postgrestest"
	"github.com/meepleo/meepleo-api/migrations"
)

// The identity flows against a real database: the repository, the
// transactions and the SQL guards (single revocation) are exercised together.
func TestIdentityFlows(t *testing.T) {
	pool := postgrestest.New(t, func(ctx context.Context, db *sql.DB) error {
		return migrations.UpModule(ctx, db, "identity")
	})
	now := time.Now().UTC().Truncate(time.Microsecond)
	tokens := jwt.New(jwt.Config{Secret: []byte("0123456789abcdef0123456789abcdef"), Issuer: "i", Audience: "a", TTL: 15 * time.Minute})
	svc := app.NewService(postgres.NewRepository(pool), tokens, func() time.Time { return now }, 24*time.Hour)
	ctx := context.Background()

	t.Run("guest, refresh, reuse", func(t *testing.T) {
		first, err := svc.Guest(ctx)
		require.NoError(t, err)
		userID, err := svc.Authenticate(ctx, first.AccessToken)
		require.NoError(t, err)
		assert.Len(t, string(userID), 36, "user ids are UUIDs")

		second, err := svc.Refresh(ctx, first.RefreshToken)
		require.NoError(t, err)

		_, err = svc.Refresh(ctx, first.RefreshToken)
		require.ErrorIs(t, err, domain.ErrRefreshTokenReused)
		_, err = svc.Refresh(ctx, second.RefreshToken)
		require.ErrorIs(t, err, domain.ErrRefreshTokenReused, "the family was revoked in the database")
	})

	t.Run("concurrent refreshes with the same token: exactly one wins", func(t *testing.T) {
		guest, err := svc.Guest(ctx)
		require.NoError(t, err)

		var wg sync.WaitGroup
		results := make(chan error, 5)
		for range 5 {
			wg.Go(func() {
				_, err := svc.Refresh(ctx, guest.RefreshToken)
				results <- err
			})
		}
		wg.Wait()
		close(results)
		wins := 0
		for err := range results {
			if err == nil {
				wins++
			}
		}
		assert.Equal(t, 1, wins)
	})

	t.Run("logout revokes every token", func(t *testing.T) {
		guest, err := svc.Guest(ctx)
		require.NoError(t, err)
		userID, err := svc.Authenticate(ctx, guest.AccessToken)
		require.NoError(t, err)
		require.NoError(t, svc.Logout(ctx, userID))
		_, err = svc.Refresh(ctx, guest.RefreshToken)
		require.Error(t, err)
	})
}
