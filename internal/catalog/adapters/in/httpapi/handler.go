// Package httpapi is the inbound HTTP adapter of the catalog. The routing and
// request/response types are generated from the "catalog" tag of
// api/openapi.yaml (api.gen.go); this package maps them to the use cases and
// translates business errors into HTTP status codes and localized messages.
package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"math"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"github.com/meepleo/meepleo-api/internal/catalog/app"
	"github.com/meepleo/meepleo-api/internal/catalog/domain"
	"github.com/meepleo/meepleo-api/internal/platform/httpserver"
	"github.com/meepleo/meepleo-api/internal/platform/i18n"
)

// Service is the part of the catalog application the handlers use. It is an
// interface so handlers can be tested with a stub.
type Service interface {
	Game(ctx context.Context, id domain.GameID) (domain.Game, error)
	LookupBarcode(ctx context.Context, raw string) (app.LookupResult, error)
}

// Server implements the generated StrictServerInterface.
type Server struct {
	svc Service
	log *slog.Logger
}

var _ StrictServerInterface = (*Server)(nil)

// NewServer returns the catalog handlers.
func NewServer(svc Service, log *slog.Logger) *Server {
	return &Server{svc: svc, log: log}
}

// Mount registers the catalog routes on r, behind the OpenAPI request
// validator (which also enforces the security requirements of the spec).
func Mount(r chi.Router, h *Server, validator func(http.Handler) http.Handler) {
	r.Group(func(r chi.Router) {
		r.Use(validator)
		strict := NewStrictHandlerWithOptions(h, nil, StrictHTTPServerOptions{
			RequestErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, _ error) {
				writeError(w, r, http.StatusBadRequest, codeInvalidRequest)
			},
			ResponseErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, err error) {
				httpserver.WriteUnexpected(w, r, h.log, err)
			},
		})
		HandlerWithOptions(strict, ChiServerOptions{
			BaseRouter: r,
			ErrorHandlerFunc: func(w http.ResponseWriter, r *http.Request, _ error) {
				writeError(w, r, http.StatusBadRequest, codeInvalidRequest)
			},
		})
	})
}

func errorBody(ctx context.Context, code string) Error {
	return Error{Message: messages.Get(i18n.Locale(ctx), code), Code: &code}
}

func writeError(w http.ResponseWriter, r *http.Request, status int, code string) {
	httpserver.WriteError(w, status, code, messages.Get(i18n.Locale(r.Context()), code))
}

func parseGameID(s string) (domain.GameID, bool) {
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil || n <= 0 {
		return 0, false
	}
	return domain.GameID(n), true
}

// GetGame handles GET /games/{game_id}.
func (h *Server) GetGame(ctx context.Context, req GetGameRequestObject) (GetGameResponseObject, error) {
	id, ok := parseGameID(req.GameId)
	if !ok {
		return GetGame404JSONResponse{NotFoundJSONResponse(errorBody(ctx, codeGameNotFound))}, nil
	}
	g, err := h.svc.Game(ctx, id)
	if errors.Is(err, domain.ErrGameNotFound) {
		return GetGame404JSONResponse{NotFoundJSONResponse(errorBody(ctx, codeGameNotFound))}, nil
	}
	if err != nil {
		return nil, err
	}
	return GetGame200JSONResponse(toGame(g, i18n.Locale(ctx))), nil
}

// GetGameRules handles GET /games/{game_id}/rules.
func (h *Server) GetGameRules(ctx context.Context, req GetGameRulesRequestObject) (GetGameRulesResponseObject, error) {
	id, ok := parseGameID(req.GameId)
	if !ok {
		return GetGameRules404JSONResponse{NotFoundJSONResponse(errorBody(ctx, codeGameNotFound))}, nil
	}
	g, err := h.svc.Game(ctx, id)
	if errors.Is(err, domain.ErrGameNotFound) {
		return GetGameRules404JSONResponse{NotFoundJSONResponse(errorBody(ctx, codeGameNotFound))}, nil
	}
	if err != nil {
		return nil, err
	}
	return GetGameRules200JSONResponse(toGameRules(g, i18n.Locale(ctx))), nil
}

// LookupBarcode handles GET /catalog/barcode/{code}.
func (h *Server) LookupBarcode(ctx context.Context, req LookupBarcodeRequestObject) (LookupBarcodeResponseObject, error) {
	res, err := h.svc.LookupBarcode(ctx, req.Code)
	switch {
	case errors.Is(err, domain.ErrBarcodeInvalid):
		return LookupBarcode400JSONResponse{BadRequestJSONResponse(errorBody(ctx, codeBarcodeInvalid))}, nil
	case errors.Is(err, domain.ErrBarcodeNotFound):
		return LookupBarcode404JSONResponse{NotFoundJSONResponse(errorBody(ctx, codeBarcodeNotFound))}, nil
	case errors.Is(err, domain.ErrNotBoardGame):
		return LookupBarcode404JSONResponse{NotFoundJSONResponse(errorBody(ctx, codeNotBoardGame))}, nil
	case err != nil:
		return nil, err
	}

	switch res.Status {
	case app.LookupFound:
		game := toGame(res.Game, i18n.Locale(ctx))
		return LookupBarcode200JSONResponse{Status: BarcodeLookupStatus(res.Status), Game: &game}, nil
	case app.LookupAmbiguous:
		return LookupBarcode200JSONResponse{Status: BarcodeLookupStatus(res.Status), Candidates: toCandidates(res.Candidates)}, nil
	default:
		retry := int(math.Ceil(res.RetryAfter.Seconds()))
		return LookupBarcode202JSONResponse{Status: BarcodeLookupStatus(app.LookupPending), RetryAfterSeconds: &retry}, nil
	}
}

// SearchGames handles GET /catalog/games, postponed until the BoardGameGeek
// API is connected.
func (h *Server) SearchGames(ctx context.Context, _ SearchGamesRequestObject) (SearchGamesResponseObject, error) {
	return SearchGames501JSONResponse{NotImplementedJSONResponse(errorBody(ctx, codeSearchDisabled))}, nil
}
