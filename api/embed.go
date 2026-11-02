// Package api embeds the OpenAPI contract, the source of truth of the HTTP
// API. It is served on /docs and used to validate incoming requests.
package api

import _ "embed"

// Spec is the raw api/openapi.yaml document.
//
//go:embed openapi.yaml
var Spec []byte
