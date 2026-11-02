// Package redis opens the instrumented go-redis client.
package redis

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/extra/redisotel/v9"
	goredis "github.com/redis/go-redis/v9"
)

// NewClient returns a Redis client traced with OpenTelemetry.
//
// It does not ping: Redis is a cache and its absence must never prevent the
// API from serving (cache decorators fall back to Postgres). Readiness
// reports it instead.
func NewClient(url string) (*goredis.Client, error) {
	opts, err := goredis.ParseURL(url)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	client := goredis.NewClient(opts)
	if err := redisotel.InstrumentTracing(client, redisotel.WithDBStatement(false)); err != nil {
		_ = client.Close()
		return nil, fmt.Errorf("instrument redis tracing: %w", err)
	}
	return client, nil
}

// Ping is the readiness check for Redis.
func Ping(client *goredis.Client) func(context.Context) error {
	return func(ctx context.Context) error {
		return client.Ping(ctx).Err()
	}
}
