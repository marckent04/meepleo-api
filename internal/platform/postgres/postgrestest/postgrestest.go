// Package postgrestest starts a throwaway PostgreSQL in a container for
// integration tests (testcontainers-go). Never mock pgx: test against the
// real database.
package postgrestest

import (
	"context"
	"database/sql"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
)

// Image is the PostgreSQL version used in tests; keep it in sync with
// docker-compose.yml.
const Image = "postgres:18-alpine"

// New starts PostgreSQL, applies migrate and returns a pool. The container is
// removed when the test ends.
func New(t testing.TB, migrate func(ctx context.Context, db *sql.DB) error) *pgxpool.Pool {
	t.Helper()
	ctx := context.Background()

	ctr, err := tcpostgres.Run(ctx, Image,
		tcpostgres.WithDatabase("meepleo"),
		tcpostgres.WithUsername("meepleo"),
		tcpostgres.WithPassword("meepleo"),
		tcpostgres.BasicWaitStrategies(),
	)
	if err != nil {
		t.Fatalf("start postgres container: %v", err)
	}
	t.Cleanup(func() {
		if err := ctr.Terminate(context.Background()); err != nil {
			t.Logf("terminate postgres container: %v", err)
		}
	})

	url, err := ctr.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatalf("postgres connection string: %v", err)
	}
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatalf("open pool: %v", err)
	}
	t.Cleanup(pool.Close)

	if migrate != nil {
		db := stdlib.OpenDBFromPool(pool)
		defer db.Close()
		if err := migrate(ctx, db); err != nil {
			t.Fatalf("migrate: %v", err)
		}
	}
	return pool
}
