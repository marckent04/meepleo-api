// Package rediscache decorates the catalog ports with a Redis cache.
//
// Strategy:
//   - read-through on app.Games: game sheets under catalog:game:v1:<id> and
//     final barcode resolutions under catalog:barcode:v1:<ean>, with a TTL;
//   - a barcode that is still pending (nothing stored yet) is never cached,
//     so the app sees the sheet as soon as the worker stores it;
//   - a negative resolution is cached no longer than its retry date;
//   - explicit invalidation on write: the decorated TxManager records the keys
//     touched by the worker and deletes them after the commit;
//   - Redis is best-effort: any Redis error is logged and the call falls back
//     to the decorated port (Postgres). The cache never fails a request.
//
// The persistent negative cache (barcodes.status + retry_after in Postgres)
// is what prevents calling the model again for unknown codes, so there is no
// Redis cache in front of the generator.
package rediscache

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	goredis "github.com/redis/go-redis/v9"

	"github.com/meepleo/meepleo-api/internal/catalog/app"
	"github.com/meepleo/meepleo-api/internal/catalog/domain"
)

// Keys are prefixed by module and entity and versioned: bump the version when
// the cached format changes, old entries then simply expire.
func gameKey(id domain.GameID) string       { return fmt.Sprintf("catalog:game:v1:%d", id) }
func barcodeKey(code domain.Barcode) string { return "catalog:barcode:v1:" + string(code) }

// CachedGames decorates app.Games with a read-through cache.
type CachedGames struct {
	next app.Games
	rdb  *goredis.Client
	ttl  time.Duration
	now  func() time.Time
	log  *slog.Logger
}

// NewCachedGames returns the decorator.
func NewCachedGames(next app.Games, rdb *goredis.Client, ttl time.Duration, now func() time.Time, log *slog.Logger) *CachedGames {
	return &CachedGames{next: next, rdb: rdb, ttl: ttl, now: now, log: log}
}

// ByID implements app.Games.
func (c *CachedGames) ByID(ctx context.Context, id domain.GameID) (domain.Game, error) {
	key := gameKey(id)
	var cached cachedGame
	if c.get(ctx, key, &cached) {
		return cached.toDomain(), nil
	}
	g, err := c.next.ByID(ctx, id)
	if err != nil {
		return domain.Game{}, err
	}
	c.set(ctx, key, fromGame(g), c.ttl)
	return g, nil
}

// Resolution implements app.Games.
func (c *CachedGames) Resolution(ctx context.Context, code domain.Barcode) (domain.BarcodeResolution, bool, error) {
	key := barcodeKey(code)
	var cached cachedResolution
	if c.get(ctx, key, &cached) {
		return cached.toDomain(), true, nil
	}
	res, ok, err := c.next.Resolution(ctx, code)
	if err != nil || !ok {
		return res, ok, err
	}
	ttl := c.ttl
	if res.Status.IsNegative() && !res.RetryAfter.IsZero() {
		ttl = min(ttl, res.RetryAfter.Sub(c.now()))
	}
	if ttl > 0 {
		c.set(ctx, key, fromResolution(res), ttl)
	}
	return res, true, nil
}

func (c *CachedGames) get(ctx context.Context, key string, dst any) bool {
	b, err := c.rdb.Get(ctx, key).Bytes()
	if errors.Is(err, goredis.Nil) {
		return false
	}
	if err != nil {
		c.log.WarnContext(ctx, "cache read failed, falling back to postgres", slog.String("key", key), slog.String("error", err.Error()))
		return false
	}
	if err := json.Unmarshal(b, dst); err != nil {
		c.log.WarnContext(ctx, "cache entry undecodable, ignoring it", slog.String("key", key), slog.String("error", err.Error()))
		return false
	}
	return true
}

func (c *CachedGames) set(ctx context.Context, key string, v any, ttl time.Duration) {
	b, err := json.Marshal(v)
	if err != nil {
		c.log.WarnContext(ctx, "cache entry unencodable", slog.String("key", key), slog.String("error", err.Error()))
		return
	}
	if err := c.rdb.Set(ctx, key, b, ttl).Err(); err != nil {
		c.log.WarnContext(ctx, "cache write failed", slog.String("key", key), slog.String("error", err.Error()))
	}
}

// CachedTx decorates app.TxManager: it records the keys touched by the
// writes and invalidates them once the transaction has committed (deleting
// before the commit would let a concurrent read re-cache the old value).
type CachedTx struct {
	next app.TxManager
	rdb  *goredis.Client
	log  *slog.Logger
}

// NewCachedTx returns the decorator.
func NewCachedTx(next app.TxManager, rdb *goredis.Client, log *slog.Logger) *CachedTx {
	return &CachedTx{next: next, rdb: rdb, log: log}
}

// WithinTx implements app.TxManager.
func (c *CachedTx) WithinTx(ctx context.Context, fn func(context.Context, app.Store) error) error {
	var keys []string
	err := c.next.WithinTx(ctx, func(ctx context.Context, s app.Store) error {
		keys = keys[:0] // the transaction may be retried by the decorated manager
		return fn(ctx, &invalidatingStore{Store: s, keys: &keys})
	})
	if err != nil {
		return err
	}
	if len(keys) > 0 {
		if err := c.rdb.Del(ctx, keys...).Err(); err != nil {
			// The TTL bounds the staleness; the write itself succeeded.
			c.log.WarnContext(ctx, "cache invalidation failed", slog.Any("keys", keys), slog.String("error", err.Error()))
		}
	}
	return nil
}

type invalidatingStore struct {
	app.Store
	keys *[]string
}

func (s *invalidatingStore) SaveGame(ctx context.Context, g domain.Game, raw []byte) (domain.GameID, error) {
	id, err := s.Store.SaveGame(ctx, g, raw)
	if err == nil {
		*s.keys = append(*s.keys, gameKey(id))
	}
	return id, err
}

func (s *invalidatingStore) SaveResolution(ctx context.Context, r domain.BarcodeResolution) error {
	err := s.Store.SaveResolution(ctx, r)
	if err == nil {
		*s.keys = append(*s.keys, barcodeKey(r.Barcode))
	}
	return err
}
