package app

import (
	"context"
	"fmt"
	"time"

	"github.com/meepleo/meepleo-api/internal/catalog/domain"
)

// LookupStatus is the outcome of a barcode lookup.
type LookupStatus string

// Lookup outcomes.
const (
	LookupFound     LookupStatus = "found"
	LookupAmbiguous LookupStatus = "ambiguous"
	LookupPending   LookupStatus = "pending"
)

// LookupResult is what the app gets back after a scan.
type LookupResult struct {
	Status     LookupStatus
	Game       domain.Game        // when found
	Candidates []domain.Candidate // when ambiguous
	// RetryAfter is the suggested polling delay when pending.
	RetryAfter time.Duration
}

// Service serves the read side of the catalog.
type Service struct {
	games     Games
	queue     Queue
	now       func() time.Time
	pollDelay time.Duration
}

// NewService returns the catalog service. now is injected for tests;
// pollDelay is the delay suggested to clients polling a pending barcode.
func NewService(games Games, queue Queue, now func() time.Time, pollDelay time.Duration) *Service {
	return &Service{games: games, queue: queue, now: now, pollDelay: pollDelay}
}

// Game returns a game sheet.
func (s *Service) Game(ctx context.Context, id domain.GameID) (domain.Game, error) {
	g, err := s.games.ByID(ctx, id)
	if err != nil {
		return domain.Game{}, fmt.Errorf("get game %d: %w", id, err)
	}
	return g, nil
}

// LookupBarcode resolves a scanned barcode. Unknown codes, and negative
// answers whose retry date has passed, are queued for generation and
// reported as pending: the generation takes too long to happen in the request.
func (s *Service) LookupBarcode(ctx context.Context, raw string) (LookupResult, error) {
	code, err := domain.ParseBarcode(raw)
	if err != nil {
		return LookupResult{}, err
	}

	res, ok, err := s.games.Resolution(ctx, code)
	if err != nil {
		return LookupResult{}, fmt.Errorf("resolve barcode %s: %w", code, err)
	}

	if ok {
		switch {
		case res.Status == domain.BarcodeFound:
			g, err := s.games.ByID(ctx, res.GameID)
			if err != nil {
				return LookupResult{}, fmt.Errorf("get game of barcode %s: %w", code, err)
			}
			return LookupResult{Status: LookupFound, Game: g}, nil
		case res.Status == domain.BarcodeAmbiguous:
			return LookupResult{Status: LookupAmbiguous, Candidates: res.Candidates}, nil
		case res.Status == domain.BarcodeNotBoardGame && !res.NeedsGeneration(s.now()):
			return LookupResult{}, domain.ErrNotBoardGame
		case res.Status.IsNegative() && !res.NeedsGeneration(s.now()):
			return LookupResult{}, domain.ErrBarcodeNotFound
		}
	}

	if err := s.queue.Enqueue(ctx, code); err != nil {
		return LookupResult{}, fmt.Errorf("enqueue barcode %s: %w", code, err)
	}
	return LookupResult{Status: LookupPending, RetryAfter: s.pollDelay}, nil
}
