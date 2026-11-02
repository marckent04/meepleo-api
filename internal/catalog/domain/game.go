package domain

import (
	"errors"
	"fmt"
	"slices"
)

// GameID identifies a game sheet.
type GameID int64

// Confidence is how sure the identification of a product is.
type Confidence string

// Confidence levels.
const (
	ConfidenceHigh   Confidence = "high"
	ConfidenceMedium Confidence = "medium"
	ConfidenceLow    Confidence = "low"
)

func (c Confidence) valid() bool {
	return c == ConfidenceHigh || c == ConfidenceMedium || c == ConfidenceLow
}

// ReviewStatus tracks the human review of a generated sheet.
type ReviewStatus string

// Review statuses.
const (
	ReviewUnreviewed ReviewStatus = "unreviewed"
	ReviewReviewed   ReviewStatus = "reviewed"
	ReviewFlagged    ReviewStatus = "flagged"
)

// RulesStatus tells the app whether the rules can be shown yet.
type RulesStatus string

// Rules statuses.
const (
	RulesReady     RulesStatus = "ready"
	RulesPreparing RulesStatus = "preparing"
)

// Section groups rule items the way a rulebook is read.
type Section string

// Rule sections.
const (
	SectionSetup       Section = "setup"
	SectionTurnStep    Section = "turn_step"
	SectionSpecialRule Section = "special_rule"
	SectionEndTrigger  Section = "end_trigger"
	SectionScoring     Section = "scoring"
	SectionTieBreaker  Section = "tie_breaker"
)

// Sections lists every section in reading order.
var Sections = []Section{SectionSetup, SectionTurnStep, SectionSpecialRule, SectionEndTrigger, SectionScoring, SectionTieBreaker}

// Players describes the supported player counts.
type Players struct {
	Min, Max    int
	Recommended []int
}

// Duration is a play time range in minutes; 0 means unknown.
type Duration struct {
	Min, Max int
}

// RuleItem is one element of the rules (a setup step, a turn step, a
// scoring rule...).
type RuleItem struct {
	Section Section
	Key     string
	// Order is the position within the section; 0 when the section is
	// unordered (special rules, end triggers).
	Order int
	// PlayerCounts restricts the item to some player counts; nil means it
	// applies to every configuration.
	PlayerCounts []int
	// Optional is only meaningful for turn steps.
	Optional bool
	Title    LocalizedText
	Text     LocalizedText
}

// AppliesTo reports whether the item applies to a game with n players.
func (r RuleItem) AppliesTo(n int) bool {
	return len(r.PlayerCounts) == 0 || slices.Contains(r.PlayerCounts, n)
}

// Source is a web page the sheet was built from.
type Source struct {
	Title, URL string
}

// Game is a board game sheet: identification, play information, summarized
// and structured rules, and provenance.
type Game struct {
	ID             GameID
	Name           string
	LocalizedNames LocalizedText
	Edition        string
	Publisher      string
	Year           int
	BGGID          int
	Confidence     Confidence
	Players        Players
	MinAge         int // 0 when unknown
	Duration       Duration
	Languages      []string
	Description    LocalizedText
	TurnSummary    LocalizedText
	EndTiming      LocalizedText
	EndWinner      LocalizedText
	Categories     []string
	ImageURL       string
	ArtKey         string
	ReviewStatus   ReviewStatus
	GeneratedBy    string
	Rules          []RuleItem
	Sources        []Source
	Warnings       []LocalizedText
}

// NewGame validates a sheet and returns it with defaults applied. It enforces
// the same invariants as the database constraints, so an invalid sheet (for
// instance a hallucinated one from the model) is rejected before any write.
func NewGame(g Game) (Game, error) {
	var errs []error
	if g.Name == "" {
		errs = append(errs, errors.New("name is required"))
	}
	if g.Players.Min < 1 || g.Players.Max < g.Players.Min {
		errs = append(errs, fmt.Errorf("players must satisfy 1 <= min <= max, got %d-%d", g.Players.Min, g.Players.Max))
	}
	if g.Duration.Min < 0 || g.Duration.Max < 0 ||
		(g.Duration.Min > 0 && g.Duration.Max > 0 && g.Duration.Max < g.Duration.Min) {
		errs = append(errs, fmt.Errorf("duration must satisfy min <= max, got %d-%d", g.Duration.Min, g.Duration.Max))
	}
	if g.MinAge < 0 {
		errs = append(errs, errors.New("min age must be positive"))
	}
	if !g.Confidence.valid() {
		errs = append(errs, fmt.Errorf("unknown confidence %q", g.Confidence))
	}
	if len(g.Languages) == 0 {
		errs = append(errs, errors.New("at least one language is required"))
	}
	for _, c := range g.Categories {
		if !IsCategory(c) {
			errs = append(errs, fmt.Errorf("unknown category %q", c))
		}
	}
	keys := make(map[string]bool, len(g.Rules))
	for _, r := range g.Rules {
		if !slices.Contains(Sections, r.Section) {
			errs = append(errs, fmt.Errorf("rule %q: unknown section %q", r.Key, r.Section))
		}
		if r.Key == "" {
			errs = append(errs, errors.New("rule key is required"))
		} else if keys[r.Key] {
			errs = append(errs, fmt.Errorf("duplicate rule key %q", r.Key))
		}
		keys[r.Key] = true
		if r.Text.IsZero() {
			errs = append(errs, fmt.Errorf("rule %q: text is required", r.Key))
		}
	}
	if err := errors.Join(errs...); err != nil {
		return Game{}, fmt.Errorf("%w: %w", ErrInvalidGame, err)
	}

	if g.ReviewStatus == "" {
		g.ReviewStatus = ReviewUnreviewed
	}
	if g.Description == nil {
		g.Description = LocalizedText{}
	}
	return g, nil
}

// DisplayName returns the name in lang when a localized name exists.
func (g Game) DisplayName(lang string) string {
	if s := g.LocalizedNames.Resolve(lang); s != "" {
		return s
	}
	return g.Name
}

// RulesStatus is ready once the sheet holds structured rules.
func (g Game) RulesStatus() RulesStatus {
	if len(g.Rules) > 0 {
		return RulesReady
	}
	return RulesPreparing
}

// DurationMinutes returns a single play time for displays that show one
// number: the upper bound when known, the lower bound otherwise.
func (g Game) DurationMinutes() int {
	if g.Duration.Max > 0 {
		return g.Duration.Max
	}
	return g.Duration.Min
}

// RulesIn returns the rule items of a section, in order.
func (g Game) RulesIn(s Section) []RuleItem {
	var out []RuleItem
	for _, r := range g.Rules {
		if r.Section == s {
			out = append(out, r)
		}
	}
	slices.SortStableFunc(out, func(a, b RuleItem) int { return a.Order - b.Order })
	return out
}
