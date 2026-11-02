package httpserver

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/getkin/kin-openapi/openapi3filter"
	nethttpmiddleware "github.com/oapi-codegen/nethttp-middleware"

	"github.com/meepleo/meepleo-api/internal/platform/auth"
)

// errNoPrincipal is returned to the validator when a secured operation is
// called without a valid bearer token.
var errNoPrincipal = errors.New("no authenticated principal")

// LoadSpec parses and validates the OpenAPI contract.
func LoadSpec(ctx context.Context, data []byte) (*openapi3.T, error) {
	loader := openapi3.NewLoader()
	spec, err := loader.LoadFromData(data)
	if err != nil {
		return nil, fmt.Errorf("load openapi spec: %w", err)
	}
	if err := spec.Validate(ctx); err != nil {
		return nil, fmt.Errorf("validate openapi spec: %w", err)
	}
	// Host validation is meaningless behind proxies and in tests.
	spec.Servers = nil
	return spec, nil
}

// RequestValidator validates requests against the OpenAPI contract
// (parameters, bodies) and enforces its security requirements: an operation
// declaring bearerAuth gets a 401 unless auth.Middleware attached a principal.
// Modules apply it to their own route group.
func RequestValidator(spec *openapi3.T, log *slog.Logger) func(http.Handler) http.Handler {
	return nethttpmiddleware.OapiRequestValidatorWithOptions(spec, &nethttpmiddleware.Options{
		DoNotValidateServers: true,
		Options: openapi3filter.Options{
			AuthenticationFunc: func(_ context.Context, in *openapi3filter.AuthenticationInput) error {
				if _, ok := auth.FromContext(in.RequestValidationInput.Request.Context()); !ok {
					return errNoPrincipal
				}
				return nil
			},
		},
		ErrorHandlerWithOpts: func(ctx context.Context, err error, w http.ResponseWriter, r *http.Request, opts nethttpmiddleware.ErrorHandlerOpts) {
			var secErr *openapi3filter.SecurityRequirementsError
			switch {
			case errors.As(err, &secErr):
				WritePlatformError(w, r, http.StatusUnauthorized, CodeUnauthorized)
			case opts.MatchedRoute == nil:
				WritePlatformError(w, r, http.StatusNotFound, CodeNotFound)
			default:
				log.DebugContext(ctx, "request rejected by openapi validation", slog.String("error", err.Error()))
				WritePlatformError(w, r, http.StatusBadRequest, CodeInvalidRequest)
			}
		},
	})
}
