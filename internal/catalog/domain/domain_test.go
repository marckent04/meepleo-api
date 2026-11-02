package domain

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParseBarcode(t *testing.T) {
	t.Parallel()
	tests := []struct {
		raw     string
		want    Barcode
		wantErr bool
	}{
		{raw: "3558380077619", want: "3558380077619"}, // EAN-13
		{raw: "4006381333931", want: "4006381333931"}, // EAN-13
		{raw: "036000291452", want: "0036000291452"},  // UPC-A normalized to EAN-13
		{raw: "3558380077618", wantErr: true},         // wrong check digit
		{raw: "355838007761", wantErr: true},          // 12 digits, wrong UPC check digit
		{raw: "35583800776", wantErr: true},           // too short
		{raw: "35583800776190", wantErr: true},        // too long
		{raw: "35583800776a9", wantErr: true},         // non digit
		{raw: "", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.raw, func(t *testing.T) {
			t.Parallel()
			got, err := ParseBarcode(tt.raw)
			if tt.wantErr {
				require.ErrorIs(t, err, ErrBarcodeInvalid)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestLocalizedTextResolve(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		text LocalizedText
		lang string
		want string
	}{
		{"requested language", LocalizedText{"fr": "Bonjour", "en": "Hello"}, "en", "Hello"},
		{"falls back to french", LocalizedText{"fr": "Bonjour", "de": "Hallo"}, "en", "Bonjour"},
		{"then english", LocalizedText{"en": "Hello", "de": "Hallo"}, "it", "Hello"},
		{"then any language", LocalizedText{"es": "Hola", "de": "Hallo"}, "it", "Hallo"},
		{"empty string is skipped", LocalizedText{"en": "", "fr": "Bonjour"}, "en", "Bonjour"},
		{"nil", nil, "fr", ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, tt.want, tt.text.Resolve(tt.lang))
		})
	}
}

func validGame() Game {
	return Game{
		Name:       "Azul",
		Confidence: ConfidenceHigh,
		Players:    Players{Min: 2, Max: 4},
		Duration:   Duration{Min: 30, Max: 45},
		Languages:  []string{"fr", "en"},
		Rules: []RuleItem{
			{Section: SectionSetup, Key: "setup-2", Order: 2, Text: LocalizedText{"fr": "b"}},
			{Section: SectionSetup, Key: "setup-1", Order: 1, Text: LocalizedText{"fr": "a"}, PlayerCounts: []int{2}},
			{Section: SectionScoring, Key: "scoring-1", Order: 1, Text: LocalizedText{"fr": "c"}},
		},
	}
}

func TestNewGame(t *testing.T) {
	t.Parallel()

	t.Run("valid game gets defaults", func(t *testing.T) {
		t.Parallel()
		g, err := NewGame(validGame())
		require.NoError(t, err)
		assert.Equal(t, ReviewUnreviewed, g.ReviewStatus)
		assert.NotNil(t, g.Description)
	})

	tests := []struct {
		name   string
		mutate func(*Game)
	}{
		{"missing name", func(g *Game) { g.Name = "" }},
		{"no player", func(g *Game) { g.Players = Players{Min: 0, Max: 4} }},
		{"max below min", func(g *Game) { g.Players = Players{Min: 4, Max: 2} }},
		{"duration inverted", func(g *Game) { g.Duration = Duration{Min: 60, Max: 30} }},
		{"unknown confidence", func(g *Game) { g.Confidence = "certain" }},
		{"no language", func(g *Game) { g.Languages = nil }},
		{"unknown section", func(g *Game) { g.Rules[0].Section = "intro" }},
		{"duplicate key", func(g *Game) { g.Rules[1].Key = g.Rules[0].Key }},
		{"empty rule text", func(g *Game) { g.Rules[0].Text = LocalizedText{"fr": ""} }},
		{"unknown category", func(g *Game) { g.Categories = []string{"strategy", "sport"} }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			g := validGame()
			tt.mutate(&g)
			_, err := NewGame(g)
			require.ErrorIs(t, err, ErrInvalidGame)
		})
	}
}

func TestGameAccessors(t *testing.T) {
	t.Parallel()
	g, err := NewGame(validGame())
	require.NoError(t, err)

	assert.Equal(t, RulesReady, g.RulesStatus())
	assert.Equal(t, 45, g.DurationMinutes())

	setup := g.RulesIn(SectionSetup)
	require.Len(t, setup, 2)
	assert.Equal(t, "setup-1", setup[0].Key, "rules are sorted by order")
	assert.True(t, setup[0].AppliesTo(2))
	assert.False(t, setup[0].AppliesTo(3))
	assert.True(t, setup[1].AppliesTo(3), "no player counts means every configuration")

	g.Rules = nil
	assert.Equal(t, RulesPreparing, g.RulesStatus())
	g.Duration = Duration{Min: 30}
	assert.Equal(t, 30, g.DurationMinutes())

	g.LocalizedNames = LocalizedText{"fr": "Azul (VF)"}
	assert.Equal(t, "Azul (VF)", g.DisplayName("fr"))
	g.LocalizedNames = nil
	assert.Equal(t, "Azul", g.DisplayName("fr"))
}

func TestBarcodeResolutionNeedsGeneration(t *testing.T) {
	t.Parallel()
	now := time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		name string
		res  BarcodeResolution
		want bool
	}{
		{"found never regenerates", BarcodeResolution{Status: BarcodeFound}, false},
		{"negative not yet expired", BarcodeResolution{Status: BarcodeNotFound, RetryAfter: now.Add(time.Hour)}, false},
		{"negative expired", BarcodeResolution{Status: BarcodeNotFound, RetryAfter: now.Add(-time.Hour)}, true},
		{"negative expiring now", BarcodeResolution{Status: BarcodeNotBoardGame, RetryAfter: now}, true},
		{"negative without retry date is final", BarcodeResolution{Status: BarcodeNotBoardGame}, false},
		{"ambiguous never regenerates", BarcodeResolution{Status: BarcodeAmbiguous}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			assert.Equal(t, tt.want, tt.res.NeedsGeneration(now))
		})
	}
}

func TestGenerationValidate(t *testing.T) {
	t.Parallel()

	t.Run("found game is validated and stamped with the model", func(t *testing.T) {
		t.Parallel()
		g, err := Generation{Status: BarcodeFound, Game: validGame(), Model: "claude-opus-5-5"}.Validate()
		require.NoError(t, err)
		assert.Equal(t, "claude-opus-5-5", g.Game.GeneratedBy)
	})

	t.Run("low confidence is downgraded to not found", func(t *testing.T) {
		t.Parallel()
		game := validGame()
		game.Confidence = ConfidenceLow
		g, err := Generation{Status: BarcodeFound, Game: game}.Validate()
		require.NoError(t, err)
		assert.Equal(t, BarcodeNotFound, g.Status)
	})

	t.Run("invalid found game is rejected", func(t *testing.T) {
		t.Parallel()
		game := validGame()
		game.Name = ""
		_, err := Generation{Status: BarcodeFound, Game: game}.Validate()
		require.ErrorIs(t, err, ErrInvalidGame)
	})

	t.Run("ambiguous requires candidates", func(t *testing.T) {
		t.Parallel()
		_, err := Generation{Status: BarcodeAmbiguous}.Validate()
		require.Error(t, err)
		_, err = Generation{Status: BarcodeAmbiguous, Candidates: []Candidate{{Name: "Azul"}}}.Validate()
		require.NoError(t, err)
	})

	t.Run("unknown status", func(t *testing.T) {
		t.Parallel()
		_, err := Generation{Status: "maybe"}.Validate()
		require.Error(t, err)
	})
}
