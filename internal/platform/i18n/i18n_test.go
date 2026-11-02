package i18n

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestNegotiate(t *testing.T) {
	t.Parallel()
	tests := []struct {
		header string
		want   string
	}{
		{"", French},
		{"fr-FR", French},
		{"en-US", English},
		{"en-GB,en;q=0.9,fr;q=0.8", English},
		{"de-DE", French},
		{"de-DE,en;q=0.5", English},
		{"garbage;;;", French},
	}
	for _, tt := range tests {
		t.Run(tt.header, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, tt.want, Negotiate(tt.header))
		})
	}
}

func TestMiddleware(t *testing.T) {
	t.Parallel()
	var got string
	h := Middleware(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		got = Locale(r.Context())
	}))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Accept-Language", "en-US")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	assert.Equal(t, English, got)
	assert.Equal(t, English, rec.Header().Get("Content-Language"))
}

func TestCatalogGet(t *testing.T) {
	t.Parallel()
	c := Catalog{"hello": {French: "bonjour", English: "hello"}, "only_fr": {French: "seulement"}}
	assert.Equal(t, "hello", c.Get(English, "hello"))
	assert.Equal(t, "seulement", c.Get(English, "only_fr"))
	assert.Equal(t, "missing", c.Get(French, "missing"))
}
