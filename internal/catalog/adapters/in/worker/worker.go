// Package worker is the inbound adapter that drives the sheet generation
// from a loop instead of an HTTP request.
package worker

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/codes"

	"github.com/meepleo/meepleo-api/internal/catalog/app"
	"github.com/meepleo/meepleo-api/internal/catalog/domain"
)

// Worker processes the generation queue until its context is cancelled.
type Worker struct {
	gen      *app.Generator
	log      *slog.Logger
	interval time.Duration
}

// New returns a Worker that polls every interval when idle.
func New(gen *app.Generator, log *slog.Logger, interval time.Duration) *Worker {
	return &Worker{gen: gen, log: log, interval: interval}
}

// Run processes barcodes back to back while there is work and budget, and
// waits interval otherwise. It returns nil when ctx is cancelled; a barcode
// being generated at that moment keeps its lease, which simply expires.
func (w *Worker) Run(ctx context.Context) error {
	w.log.InfoContext(ctx, "generation worker started", slog.Duration("poll_interval", w.interval))
	budgetLogged := false
	for {
		processed, err := w.step(ctx)
		if ctx.Err() != nil {
			w.log.InfoContext(context.WithoutCancel(ctx), "generation worker stopped")
			return nil //nolint:nilerr // cancellation is the normal way to stop
		}
		switch {
		case errors.Is(err, domain.ErrBudgetExhausted):
			if !budgetLogged {
				w.log.WarnContext(ctx, "daily generation budget exhausted, waiting")
				budgetLogged = true
			}
		case err != nil:
			w.log.ErrorContext(ctx, "generation failed", slog.String("error", err.Error()))
		default:
			budgetLogged = false
		}
		if processed && err == nil {
			continue
		}
		timer := time.NewTimer(w.interval)
		select {
		case <-ctx.Done():
			timer.Stop()
		case <-timer.C:
		}
	}
}

func (w *Worker) step(ctx context.Context) (bool, error) {
	ctx, span := otel.Tracer("catalog/worker").Start(ctx, "catalog.generation.process_next")
	defer span.End()
	processed, err := w.gen.ProcessNext(ctx)
	if err != nil && !errors.Is(err, domain.ErrBudgetExhausted) {
		span.RecordError(err)
		span.SetStatus(codes.Error, "generation failed")
	}
	return processed, err
}
