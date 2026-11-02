// Package app holds the catalog use cases: reading game sheets, resolving a
// scanned barcode, and generating the sheets of unknown barcodes in the
// background. Ports are declared here, on the consumer side, and implemented
// by the adapters.
package app

import (
	"context"
	"time"

	"github.com/meepleo/meepleo-api/internal/catalog/domain"
)

// Games reads game sheets and barcode resolutions.
type Games interface {
	// ByID returns domain.ErrGameNotFound when the game does not exist.
	ByID(ctx context.Context, id domain.GameID) (domain.Game, error)
	// Resolution returns ok=false when nothing is known about the barcode.
	Resolution(ctx context.Context, code domain.Barcode) (res domain.BarcodeResolution, ok bool, err error)
}

// QueuedBarcode is a barcode waiting for its sheet to be generated.
type QueuedBarcode struct {
	Barcode      domain.Barcode
	RequestCount int
	Attempts     int
}

// Queue is the generation queue.
type Queue interface {
	// Enqueue adds the barcode, or bumps its request count (its priority)
	// when it is already queued.
	Enqueue(ctx context.Context, code domain.Barcode) error
	// Claim takes the highest-priority barcode that is not leased, and
	// leases it until now+lease so other workers skip it. ok=false when the
	// queue holds nothing claimable.
	Claim(ctx context.Context, now time.Time, lease time.Duration) (item QueuedBarcode, ok bool, err error)
}

// Attempts counts generation attempts, which is what the daily budget limits.
type Attempts interface {
	CountSince(ctx context.Context, since time.Time) (int, error)
}

// SheetGenerator produces the sheet of a barcode (an AI model in production).
type SheetGenerator interface {
	Generate(ctx context.Context, code domain.Barcode) (domain.Generation, error)
}

// Attempt is one call to the generator, kept for audit and budgeting.
type Attempt struct {
	Barcode     domain.Barcode
	AttemptedAt time.Time
	Outcome     string // a domain.BarcodeStatus, or "error"
	Model       string
}

// Store groups the writes of the generation worker. Its methods run inside
// the transaction opened by TxManager.
type Store interface {
	// SaveGame stores a sheet; raw is the generator output kept for audit.
	SaveGame(ctx context.Context, g domain.Game, raw []byte) (domain.GameID, error)
	SaveResolution(ctx context.Context, r domain.BarcodeResolution) error
	Dequeue(ctx context.Context, code domain.Barcode) error
	Reschedule(ctx context.Context, code domain.Barcode, lastError string, lockedUntil time.Time) error
	RecordAttempt(ctx context.Context, a Attempt) error
}

// TxManager runs fn in a transaction: every Store write commits or none does.
type TxManager interface {
	WithinTx(ctx context.Context, fn func(ctx context.Context, s Store) error) error
}
