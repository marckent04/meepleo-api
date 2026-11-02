package claudeapi

import (
	"encoding/json"
	"fmt"

	"github.com/meepleo/meepleo-api/internal/catalog/domain"
)

// The model answers with a JSON document constrained by outputSchema
// (structured outputs). Its shape follows the "found" object of the original
// init.sql. sheet and its children are the partner model: they never leave
// this adapter and are mapped explicitly to domain.Generation.

type localized map[string]string

type sheetGame struct {
	Name               string    `json:"name"`
	LocalizedNames     localized `json:"localized_names"`
	Edition            *string   `json:"edition"`
	Publisher          *string   `json:"publisher"`
	Year               *int      `json:"year"`
	BGGID              *int      `json:"bgg_id"`
	PlayersMin         int       `json:"players_min"`
	PlayersMax         int       `json:"players_max"`
	PlayersRecommended []int     `json:"players_recommended"`
	MinAge             *int      `json:"min_age"`
	DurationMin        *int      `json:"duration_min"`
	DurationMax        *int      `json:"duration_max"`
	Categories         []string  `json:"categories"`
	Description        localized `json:"description"`
	TurnSummary        localized `json:"turn_summary"`
	EndTiming          localized `json:"end_timing"`
	EndWinner          localized `json:"end_winner"`
}

type sheetRule struct {
	Section      string    `json:"section"`
	Key          string    `json:"key"`
	SortOrder    *int      `json:"sort_order"`
	PlayerCounts []int     `json:"player_counts"`
	Optional     *bool     `json:"optional"`
	Title        localized `json:"title"`
	Text         localized `json:"text"`
}

type sheetSource struct {
	Title string `json:"title"`
	URL   string `json:"url"`
}

type sheetCandidate struct {
	Name      string  `json:"name"`
	Edition   *string `json:"edition"`
	Publisher *string `json:"publisher"`
	Year      *int    `json:"year"`
}

type sheet struct {
	Status       string           `json:"status"`
	Confidence   string           `json:"confidence"`
	EditionLabel *string          `json:"edition_label"`
	Game         *sheetGame       `json:"game"`
	Rules        []sheetRule      `json:"rules"`
	Sources      []sheetSource    `json:"sources"`
	Warnings     []localized      `json:"warnings"`
	Candidates   []sheetCandidate `json:"candidates"`
}

// languages generated for every sheet.
var languages = []string{"fr", "en"}

func obj(props map[string]any) map[string]any {
	required := make([]string, 0, len(props))
	for k := range props {
		required = append(required, k)
	}
	return map[string]any{"type": "object", "properties": props, "required": required, "additionalProperties": false}
}

func nullable(s map[string]any) map[string]any {
	return map[string]any{"anyOf": []any{s, map[string]any{"type": "null"}}}
}

func str() map[string]any     { return map[string]any{"type": "string"} }
func integer() map[string]any { return map[string]any{"type": "integer"} }
func boolean() map[string]any { return map[string]any{"type": "boolean"} }
func array(items map[string]any) map[string]any {
	return map[string]any{"type": "array", "items": items}
}
func enum(values ...string) map[string]any { return map[string]any{"type": "string", "enum": values} }

func localizedSchema() map[string]any {
	props := map[string]any{}
	for _, l := range languages {
		props[l] = str()
	}
	return obj(props)
}

func sections() []string {
	out := make([]string, len(domain.Sections))
	for i, s := range domain.Sections {
		out[i] = string(s)
	}
	return out
}

// outputSchema is the JSON Schema the response must follow.
func outputSchema() map[string]any {
	game := obj(map[string]any{
		"name":                str(),
		"localized_names":     localizedSchema(),
		"edition":             nullable(str()),
		"publisher":           nullable(str()),
		"year":                nullable(integer()),
		"bgg_id":              nullable(integer()),
		"players_min":         integer(),
		"players_max":         integer(),
		"players_recommended": array(integer()),
		"min_age":             nullable(integer()),
		"duration_min":        nullable(integer()),
		"duration_max":        nullable(integer()),
		"categories":          array(enum(domain.Categories...)),
		"description":         localizedSchema(),
		"turn_summary":        nullable(localizedSchema()),
		"end_timing":          nullable(localizedSchema()),
		"end_winner":          nullable(localizedSchema()),
	})
	rule := obj(map[string]any{
		"section":       enum(sections()...),
		"key":           str(),
		"sort_order":    nullable(integer()),
		"player_counts": nullable(array(integer())),
		"optional":      nullable(boolean()),
		"title":         nullable(localizedSchema()),
		"text":          localizedSchema(),
	})
	return obj(map[string]any{
		"status":        enum("found", "ambiguous", "not_found", "not_board_game", "invalid_barcode"),
		"confidence":    enum("high", "medium", "low"),
		"edition_label": nullable(str()),
		"game":          nullable(game),
		"rules":         array(rule),
		"sources":       array(obj(map[string]any{"title": str(), "url": str()})),
		"warnings":      array(localizedSchema()),
		"candidates": array(obj(map[string]any{
			"name":      str(),
			"edition":   nullable(str()),
			"publisher": nullable(str()),
			"year":      nullable(integer()),
		})),
	})
}

func deref[T any](p *T) T {
	var zero T
	if p == nil {
		return zero
	}
	return *p
}

// toGeneration maps the model's answer to the domain. Validation of the
// sheet itself is the domain's job (domain.Generation.Validate).
func toGeneration(raw []byte, model string) (domain.Generation, error) {
	var s sheet
	if err := json.Unmarshal(raw, &s); err != nil {
		return domain.Generation{}, fmt.Errorf("decode model answer: %w", err)
	}
	gen := domain.Generation{
		Status:       domain.BarcodeStatus(s.Status),
		EditionLabel: deref(s.EditionLabel),
		Model:        model,
		Raw:          raw,
	}
	switch gen.Status {
	case domain.BarcodeFound:
		if s.Game == nil {
			return domain.Generation{}, fmt.Errorf("model answered found without a game")
		}
		gen.Game = toGame(s)
	case domain.BarcodeAmbiguous:
		for _, c := range s.Candidates {
			gen.Candidates = append(gen.Candidates, domain.Candidate{
				Name: c.Name, Edition: deref(c.Edition), Publisher: deref(c.Publisher), Year: deref(c.Year),
			})
		}
	}
	return gen, nil
}

func toGame(s sheet) domain.Game {
	g := s.Game
	game := domain.Game{
		Name:           g.Name,
		LocalizedNames: domain.LocalizedText(g.LocalizedNames),
		Edition:        deref(g.Edition),
		Publisher:      deref(g.Publisher),
		Year:           deref(g.Year),
		BGGID:          deref(g.BGGID),
		Confidence:     domain.Confidence(s.Confidence),
		Players:        domain.Players{Min: g.PlayersMin, Max: g.PlayersMax, Recommended: g.PlayersRecommended},
		MinAge:         deref(g.MinAge),
		Duration:       domain.Duration{Min: deref(g.DurationMin), Max: deref(g.DurationMax)},
		Languages:      languages,
		Description:    domain.LocalizedText(g.Description),
		TurnSummary:    domain.LocalizedText(g.TurnSummary),
		EndTiming:      domain.LocalizedText(g.EndTiming),
		EndWinner:      domain.LocalizedText(g.EndWinner),
		Categories:     g.Categories,
	}
	for _, r := range s.Rules {
		game.Rules = append(game.Rules, domain.RuleItem{
			Section:      domain.Section(r.Section),
			Key:          r.Key,
			Order:        deref(r.SortOrder),
			PlayerCounts: r.PlayerCounts,
			Optional:     deref(r.Optional),
			Title:        domain.LocalizedText(r.Title),
			Text:         domain.LocalizedText(r.Text),
		})
	}
	for _, src := range s.Sources {
		game.Sources = append(game.Sources, domain.Source{Title: src.Title, URL: src.URL})
	}
	for _, w := range s.Warnings {
		game.Warnings = append(game.Warnings, domain.LocalizedText(w))
	}
	return game
}
