package app

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/meepleo/meepleo-api/internal/catalog/domain"
)

// GeneratorConfig tunes the generation worker.
type GeneratorConfig struct {
	// DailyBudget is the maximum number of generator calls per UTC day,
	// failures included: every call costs tokens.
	DailyBudget int
	// Lease is how long a claimed barcode is hidden from other workers.
	Lease time.Duration
	// MaxAttempts is the number of failed calls after which the barcode is
	// stored as not found.
	MaxAttempts int
	// RetryAfter is how long a negative answer is trusted before the barcode
	// may be generated again.
	RetryAfter time.Duration
	// RetryBackoff is the delay before retrying a failed barcode, doubled at
	// each failure.
	RetryBackoff time.Duration
}

// Generator turns queued barcodes into stored answers, one at a time.
type Generator struct {
	queue     Queue
	attempts  Attempts
	generator SheetGenerator
	tx        TxManager
	now       func() time.Time
	cfg       GeneratorConfig
}

// NewGenerator returns a Generator.
func NewGenerator(queue Queue, attempts Attempts, generator SheetGenerator, tx TxManager, now func() time.Time, cfg GeneratorConfig) *Generator {
	if cfg.RetryBackoff <= 0 {
		cfg.RetryBackoff = 5 * time.Minute
	}
	return &Generator{queue: queue, attempts: attempts, generator: generator, tx: tx, now: now, cfg: cfg}
}

// errorOutcome is the attempt outcome recorded when the generator fails.
const errorOutcome = "error"

// ProcessNext handles the next queued barcode.
//
// It returns processed=false when there is nothing to do (empty queue) and
// domain.ErrBudgetExhausted when the daily budget is spent; the caller then
// waits before polling again. A generator failure is recorded and the
// barcode rescheduled before the error is returned (processed=true).
func (g *Generator) ProcessNext(ctx context.Context) (bool, error) {
	now := g.now()

	used, err := g.attempts.CountSince(ctx, startOfDay(now))
	if err != nil {
		return false, fmt.Errorf("count attempts: %w", err)
	}
	if used >= g.cfg.DailyBudget {
		return false, domain.ErrBudgetExhausted
	}

	item, ok, err := g.queue.Claim(ctx, now, g.cfg.Lease)
	if err != nil {
		return false, fmt.Errorf("claim barcode: %w", err)
	}
	if !ok {
		return false, nil
	}

	gen, genErr := g.generator.Generate(ctx, item.Barcode)
	if genErr == nil {
		gen, genErr = gen.Validate()
	}
	if genErr != nil {
		if errors.Is(genErr, context.Canceled) {
			// Shutting down: leave the barcode leased, the lease expires.
			return true, genErr
		}
		if err := g.recordFailure(ctx, item, gen.Model, genErr, now); err != nil {
			return true, errors.Join(genErr, err)
		}
		return true, fmt.Errorf("generate sheet for %s: %w", item.Barcode, genErr)
	}

	if err := g.tx.WithinTx(ctx, func(ctx context.Context, s Store) error {
		return g.store(ctx, s, item.Barcode, gen, now)
	}); err != nil {
		return true, fmt.Errorf("store generation for %s: %w", item.Barcode, err)
	}
	return true, nil
}

func (g *Generator) store(ctx context.Context, s Store, code domain.Barcode, gen domain.Generation, now time.Time) error {
	res := domain.BarcodeResolution{
		Barcode:      code,
		Status:       gen.Status,
		EditionLabel: gen.EditionLabel,
		Source:       domain.SourceLLM,
		CheckedAt:    now,
	}
	switch {
	case gen.Status == domain.BarcodeFound:
		id, err := s.SaveGame(ctx, gen.Game, gen.Raw)
		if err != nil {
			return fmt.Errorf("save game: %w", err)
		}
		res.GameID = id
	case gen.Status == domain.BarcodeAmbiguous:
		res.Candidates = gen.Candidates
	case gen.Status.IsNegative():
		res.RetryAfter = now.Add(g.cfg.RetryAfter)
	}
	if err := s.SaveResolution(ctx, res); err != nil {
		return fmt.Errorf("save resolution: %w", err)
	}
	if err := s.Dequeue(ctx, code); err != nil {
		return fmt.Errorf("dequeue: %w", err)
	}
	if err := s.RecordAttempt(ctx, Attempt{Barcode: code, AttemptedAt: now, Outcome: string(gen.Status), Model: gen.Model}); err != nil {
		return fmt.Errorf("record attempt: %w", err)
	}
	return nil
}

func (g *Generator) recordFailure(ctx context.Context, item QueuedBarcode, model string, cause error, now time.Time) error {
	attempts := item.Attempts + 1
	return g.tx.WithinTx(ctx, func(ctx context.Context, s Store) error {
		if err := s.RecordAttempt(ctx, Attempt{Barcode: item.Barcode, AttemptedAt: now, Outcome: errorOutcome, Model: model}); err != nil {
			return fmt.Errorf("record attempt: %w", err)
		}
		if attempts < g.cfg.MaxAttempts {
			lockedUntil := now.Add(g.cfg.RetryBackoff << (attempts - 1))
			if err := s.Reschedule(ctx, item.Barcode, truncate(cause.Error(), 500), lockedUntil); err != nil {
				return fmt.Errorf("reschedule: %w", err)
			}
			return nil
		}
		// Give up for now: answer "not found" and try again after RetryAfter.
		if err := s.SaveResolution(ctx, domain.BarcodeResolution{
			Barcode:    item.Barcode,
			Status:     domain.BarcodeNotFound,
			Source:     domain.SourceLLM,
			CheckedAt:  now,
			RetryAfter: now.Add(g.cfg.RetryAfter),
		}); err != nil {
			return fmt.Errorf("save resolution: %w", err)
		}
		if err := s.Dequeue(ctx, item.Barcode); err != nil {
			return fmt.Errorf("dequeue: %w", err)
		}
		return nil
	})
}

func startOfDay(t time.Time) time.Time {
	y, m, d := t.UTC().Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return strings.ToValidUTF8(s[:n], "") // never cut a multi-byte character in half
}
