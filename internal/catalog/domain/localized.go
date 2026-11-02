package domain

import "sort"

// LocalizedText is a text available in several languages, keyed by ISO 639-1
// code ("fr", "en"). Sheets are generated in several languages at once and the
// language is chosen when reading, from the client's Accept-Language.
type LocalizedText map[string]string

// fallbackLanguages is the order tried when the requested language is missing.
var fallbackLanguages = []string{"fr", "en"}

// Resolve returns the text in lang, then in French, then in English, then in
// any available language (alphabetically, for determinism). It returns "" if
// the text is empty in every language.
func (t LocalizedText) Resolve(lang string) string {
	if s := t[lang]; s != "" {
		return s
	}
	for _, l := range fallbackLanguages {
		if s := t[l]; s != "" {
			return s
		}
	}
	langs := make([]string, 0, len(t))
	for l, s := range t {
		if s != "" {
			langs = append(langs, l)
		}
	}
	if len(langs) == 0 {
		return ""
	}
	sort.Strings(langs)
	return t[langs[0]]
}

// IsZero reports whether the text has no content in any language.
func (t LocalizedText) IsZero() bool {
	for _, s := range t {
		if s != "" {
			return false
		}
	}
	return true
}
