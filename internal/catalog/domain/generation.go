package domain

import (
	"errors"
	"fmt"
)

// Generation is the outcome of asking the sheet generator about a barcode.
type Generation struct {
	Status       BarcodeStatus
	Game         Game // set when Status is BarcodeFound
	EditionLabel string
	Candidates   []Candidate // set when Status is BarcodeAmbiguous
	// Model and Raw are kept for audit: which model answered, and its raw
	// output (opaque bytes for the domain).
	Model string
	Raw   []byte
}

// Validate checks that the outcome is consistent, and validates the sheet of
// a found game. A low-confidence "found" is downgraded to not found: serving a
// plausible but wrong game is worse than asking the user to scan again later.
func (g Generation) Validate() (Generation, error) {
	switch g.Status {
	case BarcodeFound:
		game, err := NewGame(g.Game)
		if err != nil {
			return Generation{}, err
		}
		if game.Confidence == ConfidenceLow {
			return Generation{Status: BarcodeNotFound, Model: g.Model, Raw: g.Raw}, nil
		}
		game.GeneratedBy = g.Model
		g.Game = game
	case BarcodeAmbiguous:
		if len(g.Candidates) == 0 {
			return Generation{}, errors.New("ambiguous generation without candidates")
		}
		for _, c := range g.Candidates {
			if c.Name == "" {
				return Generation{}, errors.New("ambiguous candidate without name")
			}
		}
	case BarcodeNotFound, BarcodeNotBoardGame, BarcodeInvalid:
	default:
		return Generation{}, fmt.Errorf("unknown generation status %q", g.Status)
	}
	return g, nil
}
