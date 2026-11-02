package httpserver

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/meepleo/meepleo-api/internal/platform/i18n"
)

// ErrorBody is the uniform error format of the API contract:
// a translated, user-displayable message plus a stable machine code.
type ErrorBody struct {
	Message string `json:"message"`
	Code    string `json:"code,omitempty"`
}

// Error codes produced by the platform itself (modules define their own).
const (
	CodeInternal         = "internal_error"
	CodeNotFound         = "not_found"
	CodeMethodNotAllowed = "method_not_allowed"
	CodeUnauthorized     = "unauthorized"
	CodeInvalidRequest   = "invalid_request"
	CodeRequestTooLarge  = "request_too_large"
	CodeTimeout          = "timeout"
	CodeUnavailable      = "unavailable"
)

var messages = i18n.Catalog{
	CodeInternal: {
		i18n.French:  "Une erreur inattendue est survenue. Réessaie dans quelques instants.",
		i18n.English: "An unexpected error occurred. Please try again in a moment.",
	},
	CodeNotFound: {
		i18n.French:  "Ressource introuvable.",
		i18n.English: "Resource not found.",
	},
	CodeMethodNotAllowed: {
		i18n.French:  "Méthode non autorisée.",
		i18n.English: "Method not allowed.",
	},
	CodeUnauthorized: {
		i18n.French:  "Authentification requise.",
		i18n.English: "Authentication required.",
	},
	CodeInvalidRequest: {
		i18n.French:  "La requête est invalide.",
		i18n.English: "The request is invalid.",
	},
	CodeRequestTooLarge: {
		i18n.French:  "La requête est trop volumineuse.",
		i18n.English: "The request is too large.",
	},
	CodeTimeout: {
		i18n.French:  "Le serveur a mis trop de temps à répondre.",
		i18n.English: "The server took too long to respond.",
	},
	CodeUnavailable: {
		i18n.French:  "Service temporairement indisponible.",
		i18n.English: "Service temporarily unavailable.",
	},
}

// WriteJSON writes v as a JSON response with the given status.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v) // the client is gone if this fails; nothing useful to do
}

// WriteError writes an error body with an already translated message.
func WriteError(w http.ResponseWriter, status int, code, message string) {
	WriteJSON(w, status, ErrorBody{Message: message, Code: code})
}

// WritePlatformError writes one of the platform error codes, translated in
// the request language.
func WritePlatformError(w http.ResponseWriter, r *http.Request, status int, code string) {
	WriteError(w, status, code, messages.Get(i18n.Locale(r.Context()), code))
}

// WriteUnexpected answers an error that no business rule explains. A deadline
// becomes a 504; anything else is logged and becomes a 500 whose body never
// reveals the cause (SQL, Redis or upstream details stay in the logs).
func WriteUnexpected(w http.ResponseWriter, r *http.Request, log *slog.Logger, err error) {
	switch {
	case errors.Is(err, context.DeadlineExceeded):
		log.WarnContext(r.Context(), "request deadline exceeded", slog.String("error", err.Error()))
		WritePlatformError(w, r, http.StatusGatewayTimeout, CodeTimeout)
	case errors.Is(err, context.Canceled):
		// The client went away: there is nobody to answer.
		w.WriteHeader(499)
	default:
		log.ErrorContext(r.Context(), "unexpected error", slog.String("error", err.Error()))
		WritePlatformError(w, r, http.StatusInternalServerError, CodeInternal)
	}
}
