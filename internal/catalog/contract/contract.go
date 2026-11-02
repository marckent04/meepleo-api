// Package contract is the public API of the catalog module: the only catalog
// package other modules may import. It depends on the standard library only,
// so the catalog can later become a separate service by implementing API
// with a network client, without changing its consumers.
package contract

import (
	"context"
	"errors"
)

// ErrGameNotFound is returned when the game does not exist.
var ErrGameNotFound = errors.New("catalog: game not found")

// GameSummary is what other modules need to know about a game.
type GameSummary struct {
	ID         string
	Name       string
	Publisher  string
	MinPlayers int
	MaxPlayers int
}

// API is what the catalog offers to other modules.
type API interface {
	// Game returns ErrGameNotFound when the game does not exist.
	Game(ctx context.Context, id string) (GameSummary, error)
}
