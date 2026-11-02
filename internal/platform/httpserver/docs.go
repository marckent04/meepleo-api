package httpserver

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

// swaggerUIVersion is pinned so the documentation page does not change under
// our feet. The assets come from a CDN to keep the binary small (see ADR 0003).
const swaggerUIVersion = "5.17.14"

const docsPage = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Meepleo API</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@` + swaggerUIVersion + `/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@` + swaggerUIVersion + `/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.ui = SwaggerUIBundle({ url: "/docs/openapi.yaml", dom_id: "#swagger-ui", persistAuthorization: true });
  </script>
</body>
</html>`

// mountDocs serves Swagger UI on /docs and the raw contract on
// /docs/openapi.yaml.
func mountDocs(r chi.Router, spec []byte) {
	r.Get("/docs", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(docsPage))
	})
	r.Get("/docs/openapi.yaml", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/yaml")
		_, _ = w.Write(spec)
	})
}
