// Package redistest starts a throwaway Redis in a container for integration
// tests (testcontainers-go).
package redistest

import (
	"context"
	"testing"

	goredis "github.com/redis/go-redis/v9"
	tcredis "github.com/testcontainers/testcontainers-go/modules/redis"
)

// Image is the Redis version used in tests; keep it in sync with
// docker-compose.yml.
const Image = "redis:8-alpine"

// Container is a running Redis.
type Container struct {
	Client *goredis.Client
	ctr    *tcredis.RedisContainer
}

// New starts Redis and returns a connected client. The container is removed
// when the test ends.
func New(t testing.TB) *Container {
	t.Helper()
	ctx := context.Background()

	ctr, err := tcredis.Run(ctx, Image)
	if err != nil {
		t.Fatalf("start redis container: %v", err)
	}
	t.Cleanup(func() {
		if err := ctr.Terminate(context.Background()); err != nil {
			t.Logf("terminate redis container: %v", err)
		}
	})

	url, err := ctr.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("redis connection string: %v", err)
	}
	opts, err := goredis.ParseURL(url)
	if err != nil {
		t.Fatalf("parse redis url: %v", err)
	}
	client := goredis.NewClient(opts)
	t.Cleanup(func() { _ = client.Close() })
	return &Container{Client: client, ctr: ctr}
}

// Stop stops the container, to test behaviour when Redis is down.
func (c *Container) Stop(t testing.TB) {
	t.Helper()
	if err := c.ctr.Stop(context.Background(), nil); err != nil {
		t.Fatalf("stop redis container: %v", err)
	}
}
