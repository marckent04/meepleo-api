package domain

import "time"

// BarcodeStatus is what is known about a barcode.
type BarcodeStatus string

// Barcode statuses.
const (
	BarcodeFound        BarcodeStatus = "found"
	BarcodeAmbiguous    BarcodeStatus = "ambiguous"
	BarcodeNotFound     BarcodeStatus = "not_found"
	BarcodeNotBoardGame BarcodeStatus = "not_board_game"
	// BarcodeInvalid is reported by the generator when the code has a valid
	// checksum but matches no real product.
	BarcodeInvalid BarcodeStatus = "invalid_barcode"
)

// IsNegative reports whether the status means "no game for this code".
func (s BarcodeStatus) IsNegative() bool {
	return s == BarcodeNotFound || s == BarcodeNotBoardGame || s == BarcodeInvalid
}

// BarcodeSource tells where a resolution comes from.
type BarcodeSource string

// Barcode sources.
const (
	SourceCatalog BarcodeSource = "catalog"
	SourceAPI     BarcodeSource = "api"
	SourceLLM     BarcodeSource = "llm"
	SourceUser    BarcodeSource = "user"
	SourceManual  BarcodeSource = "manual"
)

// Candidate is one possible game for an ambiguous barcode.
type Candidate struct {
	Name      string
	Edition   string
	Publisher string
	Year      int
	GameID    GameID // 0 when the candidate is not in the catalog
}

// BarcodeResolution is the stored answer for a barcode. Negative answers are
// stored too, with a RetryAfter date, so that unknown codes are not sent to
// the model again on every scan: it is the persistent negative cache.
type BarcodeResolution struct {
	Barcode      Barcode
	Status       BarcodeStatus
	GameID       GameID
	EditionLabel string
	Source       BarcodeSource
	CheckedAt    time.Time
	RetryAfter   time.Time // zero means never retry
	Candidates   []Candidate
}

// NeedsGeneration reports whether a negative answer is stale and the code
// should be queued for generation again.
func (r BarcodeResolution) NeedsGeneration(now time.Time) bool {
	return r.Status.IsNegative() && !r.RetryAfter.IsZero() && !now.Before(r.RetryAfter)
}
