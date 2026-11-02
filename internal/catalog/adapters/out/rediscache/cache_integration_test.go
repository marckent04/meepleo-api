//go:build integration

package rediscache_test

import (
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/meepleo/meepleo-api/internal/catalog/adapters/out/rediscache"
	"github.com/meepleo/meepleo-api/internal/catalog/app"
	"github.com/meepleo/meepleo-api/internal/catalog/domain"
	"github.com/meepleo/meepleo-api/internal/platform/redis/redistest"
)

var (
	now     = time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	discard = slog.New(slog.DiscardHandler)
)

// source is a fake source of truth that counts reads.
type source struct {
	games       map[domain.GameID]domain.Game
	resolutions map[domain.Barcode]domain.BarcodeResolution
	reads       int
}

func newSource() *source {
	return &source{games: map[domain.GameID]domain.Game{}, resolutions: map[domain.Barcode]domain.BarcodeResolution{}}
}

func (s *source) ByID(_ context.Context, id domain.GameID) (domain.Game, error) {
	s.reads++
	g, ok := s.games[id]
	if !ok {
		return domain.Game{}, domain.ErrGameNotFound
	}
	return g, nil
}

func (s *source) Resolution(_ context.Context, code domain.Barcode) (domain.BarcodeResolution, bool, error) {
	s.reads++
	r, ok := s.resolutions[code]
	return r, ok, nil
}

func (s *source) WithinTx(ctx context.Context, fn func(context.Context, app.Store) error) error {
	return fn(ctx, &sourceStore{s})
}

type sourceStore struct{ s *source }

func (st *sourceStore) SaveGame(_ context.Context, g domain.Game, _ []byte) (domain.GameID, error) {
	st.s.games[g.ID] = g
	return g.ID, nil
}

func (st *sourceStore) SaveResolution(_ context.Context, r domain.BarcodeResolution) error {
	st.s.resolutions[r.Barcode] = r
	return nil
}
func (*sourceStore) Dequeue(context.Context, domain.Barcode) error { return nil }
func (*sourceStore) Reschedule(context.Context, domain.Barcode, string, time.Time) error {
	return nil
}
func (*sourceStore) RecordAttempt(context.Context, app.Attempt) error { return nil }

func game(id domain.GameID) domain.Game {
	return domain.Game{
		ID: id, Name: "Azul", Confidence: domain.ConfidenceHigh, Players: domain.Players{Min: 2, Max: 4, Recommended: []int{2}},
		Languages: []string{"fr"}, Description: domain.LocalizedText{"fr": "Tuiles"}, ReviewStatus: domain.ReviewUnreviewed,
		Categories: []string{"abstract"},
		Rules: []domain.RuleItem{{Section: domain.SectionSetup, Key: "setup-1", Order: 1, PlayerCounts: []int{2},
			Title: domain.LocalizedText{"fr": "Mise en place"}, Text: domain.LocalizedText{"fr": "Placez."}}},
		Sources:  []domain.Source{{Title: "BGG", URL: "https://bgg"}},
		Warnings: []domain.LocalizedText{{"fr": "Attention"}},
	}
}

func TestCachedGames(t *testing.T) {
	redis := redistest.New(t)
	ctx := context.Background()
	clock := func() time.Time { return now }

	t.Run("read through: second read is served by redis", func(t *testing.T) {
		src := newSource()
		src.games[1] = game(1)
		cache := rediscache.NewCachedGames(src, redis.Client, time.Hour, clock, discard)

		first, err := cache.ByID(ctx, 1)
		require.NoError(t, err)
		second, err := cache.ByID(ctx, 1)
		require.NoError(t, err)

		assert.Equal(t, 1, src.reads)
		assert.Equal(t, first, second, "the cached sheet must be identical")
		ttl := redis.Client.TTL(ctx, "catalog:game:v1:1").Val()
		assert.Greater(t, ttl, 59*time.Minute, "entries always expire")
	})

	t.Run("missing game is not cached", func(t *testing.T) {
		src := newSource()
		cache := rediscache.NewCachedGames(src, redis.Client, time.Hour, clock, discard)
		_, err := cache.ByID(ctx, 404)
		require.ErrorIs(t, err, domain.ErrGameNotFound)
		_, err = cache.ByID(ctx, 404)
		require.ErrorIs(t, err, domain.ErrGameNotFound)
		assert.Equal(t, 2, src.reads)
	})

	t.Run("pending barcode is never cached", func(t *testing.T) {
		src := newSource()
		cache := rediscache.NewCachedGames(src, redis.Client, time.Hour, clock, discard)
		for range 2 {
			_, ok, err := cache.Resolution(ctx, "4006381333931")
			require.NoError(t, err)
			assert.False(t, ok)
		}
		assert.Equal(t, 2, src.reads)
	})

	t.Run("negative resolution is cached no longer than its retry date", func(t *testing.T) {
		src := newSource()
		src.resolutions["3558380077619"] = domain.BarcodeResolution{
			Barcode: "3558380077619", Status: domain.BarcodeNotFound, Source: domain.SourceLLM,
			CheckedAt: now, RetryAfter: now.Add(10 * time.Minute),
		}
		cache := rediscache.NewCachedGames(src, redis.Client, time.Hour, clock, discard)
		res, ok, err := cache.Resolution(ctx, "3558380077619")
		require.NoError(t, err)
		require.True(t, ok)
		assert.Equal(t, domain.BarcodeNotFound, res.Status)

		ttl := redis.Client.TTL(ctx, "catalog:barcode:v1:3558380077619").Val()
		assert.LessOrEqual(t, ttl, 10*time.Minute)
		assert.Greater(t, ttl, 9*time.Minute)

		cached, ok, err := cache.Resolution(ctx, "3558380077619")
		require.NoError(t, err)
		require.True(t, ok)
		assert.Equal(t, 1, src.reads)
		assert.True(t, cached.RetryAfter.Equal(res.RetryAfter))
	})

	t.Run("writes invalidate after commit", func(t *testing.T) {
		src := newSource()
		code := domain.Barcode("0036000291452")
		src.resolutions[code] = domain.BarcodeResolution{Barcode: code, Status: domain.BarcodeAmbiguous, Source: domain.SourceLLM,
			CheckedAt: now, Candidates: []domain.Candidate{{Name: "A"}, {Name: "B"}}}
		cache := rediscache.NewCachedGames(src, redis.Client, time.Hour, clock, discard)
		tx := rediscache.NewCachedTx(src, redis.Client, discard)

		_, _, err := cache.Resolution(ctx, code) // cached as ambiguous
		require.NoError(t, err)

		require.NoError(t, tx.WithinTx(ctx, func(ctx context.Context, s app.Store) error {
			if _, err := s.SaveGame(ctx, game(9), nil); err != nil {
				return err
			}
			return s.SaveResolution(ctx, domain.BarcodeResolution{Barcode: code, Status: domain.BarcodeFound, GameID: 9, Source: domain.SourceManual, CheckedAt: now})
		}))

		res, _, err := cache.Resolution(ctx, code)
		require.NoError(t, err)
		assert.Equal(t, domain.BarcodeFound, res.Status, "the stale ambiguous entry was invalidated")
	})

	t.Run("failed transaction invalidates nothing", func(t *testing.T) {
		src := newSource()
		src.games[5] = game(5)
		cache := rediscache.NewCachedGames(src, redis.Client, time.Hour, clock, discard)
		tx := rediscache.NewCachedTx(src, redis.Client, discard)
		_, err := cache.ByID(ctx, 5)
		require.NoError(t, err)

		boom := errors.New("boom")
		err = tx.WithinTx(ctx, func(ctx context.Context, s app.Store) error {
			_, _ = s.SaveGame(ctx, game(5), nil)
			return boom
		})
		require.ErrorIs(t, err, boom)
		assert.Equal(t, int64(1), redis.Client.Exists(ctx, "catalog:game:v1:5").Val())
	})
}

func TestCacheFallsBackWhenRedisIsDown(t *testing.T) {
	redis := redistest.New(t)
	ctx := context.Background()
	src := newSource()
	src.games[1] = game(1)
	cache := rediscache.NewCachedGames(src, redis.Client, time.Hour, func() time.Time { return now }, discard)
	tx := rediscache.NewCachedTx(src, redis.Client, discard)

	redis.Stop(t)

	g, err := cache.ByID(ctx, 1)
	require.NoError(t, err, "a Redis outage must never fail the request")
	assert.Equal(t, "Azul", g.Name)

	_, _, err = cache.Resolution(ctx, "4006381333931")
	require.NoError(t, err)

	err = tx.WithinTx(ctx, func(ctx context.Context, s app.Store) error {
		_, err := s.SaveGame(ctx, game(2), nil)
		return err
	})
	require.NoError(t, err, "a failed invalidation must not fail the committed write")
}
