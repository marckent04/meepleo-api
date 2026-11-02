// Package i18n negotiates the response language from Accept-Language and
// provides a minimal message catalog type for translated user-facing texts.
//
// The API contract says every user-facing text (errors, labels, rules) is
// returned in the language of the Accept-Language header.
package i18n

import (
	"context"
	"net/http"

	"golang.org/x/text/language"
)

// Supported languages, in order of preference. The first one is the default.
const (
	French  = "fr"
	English = "en"
)

// Default is used when the client sends no usable Accept-Language.
const Default = French

var matcher = language.NewMatcher([]language.Tag{language.French, language.English})

type localeKey struct{}

// Negotiate returns the best supported language ("fr" or "en") for an
// Accept-Language header value.
func Negotiate(acceptLanguage string) string {
	tags, _, err := language.ParseAcceptLanguage(acceptLanguage)
	if err != nil || len(tags) == 0 {
		return Default
	}
	_, idx, conf := matcher.Match(tags...)
	if conf == language.No {
		return Default
	}
	if idx == 1 {
		return English
	}
	return French
}

// WithLocale returns a context carrying the negotiated language.
func WithLocale(ctx context.Context, locale string) context.Context {
	return context.WithValue(ctx, localeKey{}, locale)
}

// Locale returns the language stored in ctx, or Default.
func Locale(ctx context.Context) string {
	if l, ok := ctx.Value(localeKey{}).(string); ok && l != "" {
		return l
	}
	return Default
}

// Middleware negotiates the language once per request and stores it in the
// request context.
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		locale := Negotiate(r.Header.Get("Accept-Language"))
		w.Header().Add("Vary", "Accept-Language")
		w.Header().Set("Content-Language", locale)
		next.ServeHTTP(w, r.WithContext(WithLocale(r.Context(), locale)))
	})
}

// Catalog maps a message key to its translations, keyed by language.
type Catalog map[string]map[string]string

// Get returns the translation of key in locale, falling back to the default
// language and then to the key itself so a missing translation is visible
// but never breaks a response.
func (c Catalog) Get(locale, key string) string {
	if t, ok := c[key]; ok {
		if s, ok := t[locale]; ok {
			return s
		}
		if s, ok := t[Default]; ok {
			return s
		}
	}
	return key
}
