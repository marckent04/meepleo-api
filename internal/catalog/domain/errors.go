// Package domain holds the catalog's business model: game sheets, structured
// rules, barcodes and their resolution, and the outcome of a sheet
// generation. It depends on the standard library only.
package domain

import "errors"

// Business errors of the catalog. Adapters translate them to transport codes.
var (
	ErrGameNotFound          = errors.New("game not found")
	ErrInvalidGame           = errors.New("invalid game")
	ErrBarcodeInvalid        = errors.New("invalid barcode")
	ErrBarcodeNotFound       = errors.New("barcode not found")
	ErrNotBoardGame          = errors.New("product is not a board game")
	ErrConflict              = errors.New("conflict")
	ErrGenerationUnavailable = errors.New("sheet generation unavailable")
	ErrBudgetExhausted       = errors.New("daily generation budget exhausted")
)
