package app

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/meepleo/meepleo-api/internal/catalog/domain"
)

const ean = domain.Barcode("3558380077619")

var now = time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)

func clock() time.Time { return now }

func azul() domain.Game {
	return domain.Game{
		Name:       "Azul",
		Confidence: domain.ConfidenceHigh,
		Players:    domain.Players{Min: 2, Max: 4},
		Languages:  []string{"fr"},
		Rules: []domain.RuleItem{
			{Section: domain.SectionSetup, Key: "setup-1", Order: 1, Text: domain.LocalizedText{"fr": "Placez le plateau."}},
		},
	}
}

func TestLookupBarcode(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		code        string
		seed        func(*memory)
		want        LookupStatus
		wantErr     error
		wantQueued  bool
		wantRequest int
	}{
		{
			name:    "invalid barcode",
			code:    "123",
			wantErr: domain.ErrBarcodeInvalid,
		},
		{
			name: "found",
			code: string(ean),
			seed: func(m *memory) {
				m.games[7] = domain.Game{ID: 7, Name: "Azul"}
				m.resolutions[ean] = domain.BarcodeResolution{Barcode: ean, Status: domain.BarcodeFound, GameID: 7}
			},
			want: LookupFound,
		},
		{
			name: "upc-a finds the ean-13 record",
			code: "036000291452",
			seed: func(m *memory) {
				m.games[1] = domain.Game{ID: 1, Name: "Coke"}
				m.resolutions["0036000291452"] = domain.BarcodeResolution{Status: domain.BarcodeFound, GameID: 1}
			},
			want: LookupFound,
		},
		{
			name: "ambiguous",
			code: string(ean),
			seed: func(m *memory) {
				m.resolutions[ean] = domain.BarcodeResolution{Status: domain.BarcodeAmbiguous, Candidates: []domain.Candidate{{Name: "Azul"}, {Name: "Azul Mini"}}}
			},
			want: LookupAmbiguous,
		},
		{
			name: "not found still trusted",
			code: string(ean),
			seed: func(m *memory) {
				m.resolutions[ean] = domain.BarcodeResolution{Status: domain.BarcodeNotFound, RetryAfter: now.Add(time.Hour)}
			},
			wantErr: domain.ErrBarcodeNotFound,
		},
		{
			name: "not a board game",
			code: string(ean),
			seed: func(m *memory) {
				m.resolutions[ean] = domain.BarcodeResolution{Status: domain.BarcodeNotBoardGame, RetryAfter: now.Add(time.Hour)}
			},
			wantErr: domain.ErrNotBoardGame,
		},
		{
			name: "expired negative answer is queued again",
			code: string(ean),
			seed: func(m *memory) {
				m.resolutions[ean] = domain.BarcodeResolution{Status: domain.BarcodeNotFound, RetryAfter: now.Add(-time.Hour)}
			},
			want:        LookupPending,
			wantQueued:  true,
			wantRequest: 1,
		},
		{
			name:        "unknown barcode is queued",
			code:        string(ean),
			want:        LookupPending,
			wantQueued:  true,
			wantRequest: 1,
		},
		{
			name: "rescanning a pending barcode raises its priority",
			code: string(ean),
			seed: func(m *memory) {
				m.queue[ean] = &queued{item: QueuedBarcode{Barcode: ean, RequestCount: 3}}
			},
			want:        LookupPending,
			wantQueued:  true,
			wantRequest: 4,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			m := newMemory()
			if tt.seed != nil {
				tt.seed(m)
			}
			svc := NewService(m, m, clock, 30*time.Second)

			got, err := svc.LookupBarcode(context.Background(), tt.code)
			if tt.wantErr != nil {
				require.ErrorIs(t, err, tt.wantErr)
				assert.Empty(t, m.queue, "a known negative answer must not be queued")
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.want, got.Status)
			if tt.wantQueued {
				require.Contains(t, m.queue, ean)
				assert.Equal(t, tt.wantRequest, m.queue[ean].item.RequestCount)
				assert.Equal(t, 30*time.Second, got.RetryAfter)
			}
		})
	}
}

func TestGame(t *testing.T) {
	t.Parallel()
	m := newMemory()
	m.games[1] = domain.Game{ID: 1, Name: "Azul"}
	svc := NewService(m, m, clock, time.Second)

	g, err := svc.Game(context.Background(), 1)
	require.NoError(t, err)
	assert.Equal(t, "Azul", g.Name)

	_, err = svc.Game(context.Background(), 2)
	require.ErrorIs(t, err, domain.ErrGameNotFound)
}

func generatorConfig() GeneratorConfig {
	return GeneratorConfig{
		DailyBudget:  10,
		Lease:        10 * time.Minute,
		MaxAttempts:  3,
		RetryAfter:   30 * 24 * time.Hour,
		RetryBackoff: 5 * time.Minute,
	}
}

func TestProcessNext(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name          string
		seed          func(*memory)
		gen           *fakeGenerator
		cfg           func(*GeneratorConfig)
		wantProcessed bool
		wantErr       error
		wantAnyErr    bool
		check         func(t *testing.T, m *memory, gen *fakeGenerator)
	}{
		{
			name:          "empty queue",
			gen:           &fakeGenerator{},
			wantProcessed: false,
			check: func(t *testing.T, _ *memory, gen *fakeGenerator) {
				assert.Zero(t, gen.calls)
			},
		},
		{
			name: "budget exhausted",
			seed: func(m *memory) {
				m.queue[ean] = &queued{item: QueuedBarcode{Barcode: ean, RequestCount: 1}}
				for range 10 {
					m.attempts = append(m.attempts, Attempt{AttemptedAt: now.Add(-time.Hour)})
				}
			},
			gen:     &fakeGenerator{},
			wantErr: domain.ErrBudgetExhausted,
			check: func(t *testing.T, _ *memory, gen *fakeGenerator) {
				assert.Zero(t, gen.calls, "the generator must not be called over budget")
			},
		},
		{
			name: "yesterday's attempts do not count",
			seed: func(m *memory) {
				m.queue[ean] = &queued{item: QueuedBarcode{Barcode: ean, RequestCount: 1}}
				for range 10 {
					m.attempts = append(m.attempts, Attempt{AttemptedAt: now.Add(-24 * time.Hour)})
				}
			},
			gen:           &fakeGenerator{gen: domain.Generation{Status: domain.BarcodeNotFound}},
			wantProcessed: true,
		},
		{
			name: "found: game stored, resolution saved, queue emptied",
			seed: func(m *memory) {
				m.queue[ean] = &queued{item: QueuedBarcode{Barcode: ean, RequestCount: 1}}
			},
			gen:           &fakeGenerator{gen: domain.Generation{Status: domain.BarcodeFound, Game: azul(), Model: "claude-opus-5-5"}},
			wantProcessed: true,
			check: func(t *testing.T, m *memory, _ *fakeGenerator) {
				res := m.resolutions[ean]
				assert.Equal(t, domain.BarcodeFound, res.Status)
				assert.Equal(t, domain.SourceLLM, res.Source)
				game := m.games[res.GameID]
				assert.Equal(t, "Azul", game.Name)
				assert.Equal(t, "claude-opus-5-5", game.GeneratedBy)
				assert.Empty(t, m.queue)
				require.Len(t, m.attempts, 1)
				assert.Equal(t, "found", m.attempts[0].Outcome)
			},
		},
		{
			name: "ambiguous: candidates saved",
			seed: func(m *memory) {
				m.queue[ean] = &queued{item: QueuedBarcode{Barcode: ean, RequestCount: 1}}
			},
			gen:           &fakeGenerator{gen: domain.Generation{Status: domain.BarcodeAmbiguous, Candidates: []domain.Candidate{{Name: "Azul"}, {Name: "Azul Duel"}}}},
			wantProcessed: true,
			check: func(t *testing.T, m *memory, _ *fakeGenerator) {
				assert.Equal(t, domain.BarcodeAmbiguous, m.resolutions[ean].Status)
				assert.Len(t, m.resolutions[ean].Candidates, 2)
				assert.Empty(t, m.games)
			},
		},
		{
			name: "not a board game: negative answer with retry date",
			seed: func(m *memory) {
				m.queue[ean] = &queued{item: QueuedBarcode{Barcode: ean, RequestCount: 1}}
			},
			gen:           &fakeGenerator{gen: domain.Generation{Status: domain.BarcodeNotBoardGame}},
			wantProcessed: true,
			check: func(t *testing.T, m *memory, _ *fakeGenerator) {
				res := m.resolutions[ean]
				assert.Equal(t, domain.BarcodeNotBoardGame, res.Status)
				assert.Equal(t, now.Add(30*24*time.Hour), res.RetryAfter)
				assert.Empty(t, m.queue)
			},
		},
		{
			name: "generator error: attempt recorded, barcode rescheduled with backoff",
			seed: func(m *memory) {
				m.queue[ean] = &queued{item: QueuedBarcode{Barcode: ean, RequestCount: 1}}
			},
			gen:           &fakeGenerator{err: domain.ErrGenerationUnavailable},
			wantProcessed: true,
			wantErr:       domain.ErrGenerationUnavailable,
			check: func(t *testing.T, m *memory, _ *fakeGenerator) {
				q := m.queue[ean]
				require.NotNil(t, q)
				assert.Equal(t, 1, q.item.Attempts)
				assert.Equal(t, now.Add(5*time.Minute), q.lockedUntil)
				assert.NotEmpty(t, q.lastError)
				require.Len(t, m.attempts, 1)
				assert.Equal(t, "error", m.attempts[0].Outcome)
				assert.NotContains(t, m.resolutions, ean)
			},
		},
		{
			name: "invalid sheet from the model counts as a failure",
			seed: func(m *memory) {
				m.queue[ean] = &queued{item: QueuedBarcode{Barcode: ean, RequestCount: 1, Attempts: 1}}
			},
			gen:           &fakeGenerator{gen: domain.Generation{Status: domain.BarcodeFound, Game: domain.Game{Name: "Broken"}}},
			wantProcessed: true,
			wantErr:       domain.ErrInvalidGame,
			check: func(t *testing.T, m *memory, _ *fakeGenerator) {
				assert.Equal(t, now.Add(10*time.Minute), m.queue[ean].lockedUntil, "backoff doubles")
			},
		},
		{
			name: "max attempts reached: stored as not found",
			seed: func(m *memory) {
				m.queue[ean] = &queued{item: QueuedBarcode{Barcode: ean, RequestCount: 1, Attempts: 2}}
			},
			gen:           &fakeGenerator{err: errors.New("boom")},
			wantProcessed: true,
			wantAnyErr:    true,
			check: func(t *testing.T, m *memory, _ *fakeGenerator) {
				assert.Empty(t, m.queue)
				res := m.resolutions[ean]
				assert.Equal(t, domain.BarcodeNotFound, res.Status)
				assert.Equal(t, now.Add(30*24*time.Hour), res.RetryAfter)
			},
		},
		{
			name: "store failure rolls everything back",
			seed: func(m *memory) {
				m.queue[ean] = &queued{item: QueuedBarcode{Barcode: ean, RequestCount: 1}}
				m.failOnSave = errors.New("db down")
			},
			gen:           &fakeGenerator{gen: domain.Generation{Status: domain.BarcodeFound, Game: azul()}},
			wantProcessed: true,
			wantAnyErr:    true,
			check: func(t *testing.T, m *memory, _ *fakeGenerator) {
				assert.Empty(t, m.games, "the game insert must be rolled back")
				assert.Empty(t, m.attempts)
				assert.Contains(t, m.queue, ean, "the barcode stays queued; its lease will expire")
			},
		},
		{
			name: "cancellation leaves the lease to expire",
			seed: func(m *memory) {
				m.queue[ean] = &queued{item: QueuedBarcode{Barcode: ean, RequestCount: 1}}
			},
			gen:           &fakeGenerator{err: context.Canceled},
			wantProcessed: true,
			wantErr:       context.Canceled,
			check: func(t *testing.T, m *memory, _ *fakeGenerator) {
				assert.Empty(t, m.attempts)
				assert.Zero(t, m.queue[ean].item.Attempts)
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			m := newMemory()
			if tt.seed != nil {
				tt.seed(m)
			}
			cfg := generatorConfig()
			if tt.cfg != nil {
				tt.cfg(&cfg)
			}
			g := NewGenerator(m, m, tt.gen, m, clock, cfg)

			processed, err := g.ProcessNext(context.Background())
			switch {
			case tt.wantErr != nil:
				require.ErrorIs(t, err, tt.wantErr)
			case tt.wantAnyErr:
				require.Error(t, err)
			default:
				require.NoError(t, err)
			}
			assert.Equal(t, tt.wantProcessed, processed)
			if tt.check != nil {
				tt.check(t, m, tt.gen)
			}
		})
	}
}
