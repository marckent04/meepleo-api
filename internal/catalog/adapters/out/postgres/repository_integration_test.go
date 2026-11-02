//go:build integration

package postgres_test

import (
	"context"
	"database/sql"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/meepleo/meepleo-api/internal/catalog/adapters/out/postgres"
	"github.com/meepleo/meepleo-api/internal/catalog/app"
	"github.com/meepleo/meepleo-api/internal/catalog/domain"
	"github.com/meepleo/meepleo-api/internal/platform/postgres/postgrestest"
	"github.com/meepleo/meepleo-api/migrations"
)

func newRepo(t *testing.T) *postgres.Repository {
	t.Helper()
	pool := postgrestest.New(t, func(ctx context.Context, db *sql.DB) error {
		return migrations.UpModule(ctx, db, "catalog")
	})
	return postgres.NewRepository(pool)
}

var now = time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)

func fullGame() domain.Game {
	g, err := domain.NewGame(domain.Game{
		Name:           "Azul",
		LocalizedNames: domain.LocalizedText{"fr": "Azul", "en": "Azul"},
		Edition:        "Édition originale",
		Publisher:      "Plan B Games",
		Year:           2017,
		BGGID:          230802,
		Confidence:     domain.ConfidenceHigh,
		Players:        domain.Players{Min: 2, Max: 4, Recommended: []int{2, 3}},
		MinAge:         8,
		Duration:       domain.Duration{Min: 30, Max: 45},
		Languages:      []string{"fr", "en"},
		Description:    domain.LocalizedText{"fr": "Jeu de tuiles.", "en": "Tile game."},
		TurnSummary:    domain.LocalizedText{"fr": "Prenez des tuiles."},
		Categories:     []string{"abstract", "family"},
		ImageURL:       "https://cdn.example.com/azul.jpg",
		GeneratedBy:    "claude-opus-5-5",
		Rules: []domain.RuleItem{
			{Section: domain.SectionSetup, Key: "setup-1", Order: 1, Text: domain.LocalizedText{"fr": "Placez les fabriques."}, PlayerCounts: []int{2}},
			{Section: domain.SectionTurnStep, Key: "turn-1", Order: 1, Optional: true, Title: domain.LocalizedText{"fr": "Offre"}, Text: domain.LocalizedText{"fr": "Prenez des tuiles."}},
			{Section: domain.SectionSpecialRule, Key: "rule-1", Text: domain.LocalizedText{"fr": "Premier joueur."}},
		},
		Sources:  []domain.Source{{Title: "BGG", URL: "https://boardgamegeek.com/boardgame/230802"}},
		Warnings: []domain.LocalizedText{{"fr": "Vérifiez le livret."}},
	})
	if err != nil {
		panic(err)
	}
	return g
}

func TestRepository(t *testing.T) {
	repo := newRepo(t)
	ctx := context.Background()

	t.Run("full sheet round trip", func(t *testing.T) {
		var id domain.GameID
		err := repo.WithinTx(ctx, func(ctx context.Context, s app.Store) error {
			var err error
			id, err = s.SaveGame(ctx, fullGame(), []byte(`{"status":"found"}`))
			return err
		})
		require.NoError(t, err)

		got, err := repo.ByID(ctx, id)
		require.NoError(t, err)
		want := fullGame()
		want.ID = id
		assert.Equal(t, want, got)
	})

	t.Run("unknown game", func(t *testing.T) {
		_, err := repo.ByID(ctx, 999_999)
		require.ErrorIs(t, err, domain.ErrGameNotFound)
	})

	t.Run("barcode resolutions", func(t *testing.T) {
		code := domain.Barcode("3558380077619")
		_, ok, err := repo.Resolution(ctx, code)
		require.NoError(t, err)
		assert.False(t, ok)

		var id domain.GameID
		require.NoError(t, repo.WithinTx(ctx, func(ctx context.Context, s app.Store) error {
			id, err = s.SaveGame(ctx, fullGame(), nil)
			if err != nil {
				return err
			}
			return s.SaveResolution(ctx, domain.BarcodeResolution{
				Barcode: code, Status: domain.BarcodeFound, GameID: id, Source: domain.SourceLLM, CheckedAt: now,
			})
		}))
		res, ok, err := repo.Resolution(ctx, code)
		require.NoError(t, err)
		require.True(t, ok)
		assert.Equal(t, domain.BarcodeFound, res.Status)
		assert.Equal(t, id, res.GameID)
		assert.True(t, res.CheckedAt.Equal(now))

		ambiguous := domain.Barcode("4006381333931")
		require.NoError(t, repo.WithinTx(ctx, func(ctx context.Context, s app.Store) error {
			return s.SaveResolution(ctx, domain.BarcodeResolution{
				Barcode: ambiguous, Status: domain.BarcodeAmbiguous, Source: domain.SourceLLM, CheckedAt: now,
				Candidates: []domain.Candidate{{Name: "Azul", Year: 2017, GameID: id}, {Name: "Azul Mini"}},
			})
		}))
		res, ok, err = repo.Resolution(ctx, ambiguous)
		require.NoError(t, err)
		require.True(t, ok)
		require.Len(t, res.Candidates, 2)
		assert.Equal(t, id, res.Candidates[0].GameID)
	})

	t.Run("found without game violates the constraint", func(t *testing.T) {
		err := repo.WithinTx(ctx, func(ctx context.Context, s app.Store) error {
			return s.SaveResolution(ctx, domain.BarcodeResolution{Barcode: "0036000291452", Status: domain.BarcodeFound, Source: domain.SourceLLM, CheckedAt: now})
		})
		require.ErrorIs(t, err, domain.ErrInvalidGame)
	})

	t.Run("transaction rolls back on error", func(t *testing.T) {
		boom := errors.New("boom")
		var id domain.GameID
		err := repo.WithinTx(ctx, func(ctx context.Context, s app.Store) error {
			var err error
			id, err = s.SaveGame(ctx, fullGame(), nil)
			require.NoError(t, err)
			return boom
		})
		require.ErrorIs(t, err, boom)
		_, err = repo.ByID(ctx, id)
		require.ErrorIs(t, err, domain.ErrGameNotFound)
	})
}

func TestQueue(t *testing.T) {
	repo := newRepo(t)
	ctx := context.Background()
	lease := 10 * time.Minute

	low, high := domain.Barcode("4006381333931"), domain.Barcode("3558380077619")
	require.NoError(t, repo.Enqueue(ctx, low))
	require.NoError(t, repo.Enqueue(ctx, high))
	require.NoError(t, repo.Enqueue(ctx, high)) // scanned twice: higher priority

	item, ok, err := repo.Claim(ctx, now, lease)
	require.NoError(t, err)
	require.True(t, ok)
	assert.Equal(t, high, item.Barcode)
	assert.Equal(t, 2, item.RequestCount)

	item, ok, err = repo.Claim(ctx, now, lease)
	require.NoError(t, err)
	require.True(t, ok)
	assert.Equal(t, low, item.Barcode, "the leased barcode is skipped")

	_, ok, err = repo.Claim(ctx, now, lease)
	require.NoError(t, err)
	assert.False(t, ok, "everything is leased")

	item, ok, err = repo.Claim(ctx, now.Add(lease), lease)
	require.NoError(t, err)
	require.True(t, ok, "an expired lease can be claimed again")
	assert.Equal(t, high, item.Barcode)

	require.NoError(t, repo.WithinTx(ctx, func(ctx context.Context, s app.Store) error {
		if err := s.Reschedule(ctx, high, "model timeout", now.Add(time.Hour)); err != nil {
			return err
		}
		if err := s.RecordAttempt(ctx, app.Attempt{Barcode: high, AttemptedAt: now, Outcome: "error", Model: "m"}); err != nil {
			return err
		}
		return s.Dequeue(ctx, low)
	}))
	item, ok, err = repo.Claim(ctx, now.Add(time.Hour), lease)
	require.NoError(t, err)
	require.True(t, ok)
	assert.Equal(t, 1, item.Attempts)

	n, err := repo.CountSince(ctx, now.Add(-time.Minute))
	require.NoError(t, err)
	assert.Equal(t, 1, n)
	n, err = repo.CountSince(ctx, now.Add(time.Minute))
	require.NoError(t, err)
	assert.Zero(t, n)
}

func TestConcurrentClaimsNeverReturnTheSameBarcode(t *testing.T) {
	repo := newRepo(t)
	ctx := context.Background()
	codes := []domain.Barcode{"4006381333931", "3558380077619", "0036000291452", "5901234123457"}
	for _, c := range codes {
		require.NoError(t, repo.Enqueue(ctx, c))
	}

	var mu sync.Mutex
	seen := map[domain.Barcode]int{}
	var wg sync.WaitGroup
	for range 8 {
		wg.Go(func() {
			item, ok, err := repo.Claim(ctx, now, time.Minute)
			assert.NoError(t, err)
			if ok {
				mu.Lock()
				seen[item.Barcode]++
				mu.Unlock()
			}
		})
	}
	wg.Wait()

	assert.Len(t, seen, len(codes))
	for code, n := range seen {
		assert.Equal(t, 1, n, "barcode %s claimed %d times", code, n)
	}
}
