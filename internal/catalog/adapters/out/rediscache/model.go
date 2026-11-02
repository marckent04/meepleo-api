package rediscache

import (
	"time"

	"github.com/meepleo/meepleo-api/internal/catalog/domain"
)

// Cache models: the serialized format belongs to this adapter, the domain
// carries no json tags. Changing these structs requires bumping the key
// version (v1).

type cachedRule struct {
	Section      string            `json:"section"`
	Key          string            `json:"key"`
	Order        int               `json:"order,omitempty"`
	PlayerCounts []int             `json:"player_counts,omitempty"`
	Optional     bool              `json:"optional,omitempty"`
	Title        map[string]string `json:"title,omitempty"`
	Text         map[string]string `json:"text"`
}

type cachedSource struct {
	Title string `json:"title"`
	URL   string `json:"url"`
}

type cachedGame struct {
	ID                 int64               `json:"id"`
	Name               string              `json:"name"`
	LocalizedNames     map[string]string   `json:"localized_names,omitempty"`
	Edition            string              `json:"edition,omitempty"`
	Publisher          string              `json:"publisher,omitempty"`
	Year               int                 `json:"year,omitempty"`
	BGGID              int                 `json:"bgg_id,omitempty"`
	Confidence         string              `json:"confidence"`
	PlayersMin         int                 `json:"players_min"`
	PlayersMax         int                 `json:"players_max"`
	PlayersRecommended []int               `json:"players_recommended,omitempty"`
	MinAge             int                 `json:"min_age,omitempty"`
	DurationMin        int                 `json:"duration_min,omitempty"`
	DurationMax        int                 `json:"duration_max,omitempty"`
	Languages          []string            `json:"languages"`
	Description        map[string]string   `json:"description"`
	TurnSummary        map[string]string   `json:"turn_summary,omitempty"`
	EndTiming          map[string]string   `json:"end_timing,omitempty"`
	EndWinner          map[string]string   `json:"end_winner,omitempty"`
	Categories         []string            `json:"categories,omitempty"`
	ImageURL           string              `json:"image_url,omitempty"`
	ArtKey             string              `json:"art_key,omitempty"`
	ReviewStatus       string              `json:"review_status"`
	GeneratedBy        string              `json:"generated_by,omitempty"`
	Rules              []cachedRule        `json:"rules,omitempty"`
	Sources            []cachedSource      `json:"sources,omitempty"`
	Warnings           []map[string]string `json:"warnings,omitempty"`
}

func fromGame(g domain.Game) cachedGame {
	c := cachedGame{
		ID:                 int64(g.ID),
		Name:               g.Name,
		LocalizedNames:     g.LocalizedNames,
		Edition:            g.Edition,
		Publisher:          g.Publisher,
		Year:               g.Year,
		BGGID:              g.BGGID,
		Confidence:         string(g.Confidence),
		PlayersMin:         g.Players.Min,
		PlayersMax:         g.Players.Max,
		PlayersRecommended: g.Players.Recommended,
		MinAge:             g.MinAge,
		DurationMin:        g.Duration.Min,
		DurationMax:        g.Duration.Max,
		Languages:          g.Languages,
		Description:        g.Description,
		TurnSummary:        g.TurnSummary,
		EndTiming:          g.EndTiming,
		EndWinner:          g.EndWinner,
		Categories:         g.Categories,
		ImageURL:           g.ImageURL,
		ArtKey:             g.ArtKey,
		ReviewStatus:       string(g.ReviewStatus),
		GeneratedBy:        g.GeneratedBy,
	}
	for _, r := range g.Rules {
		c.Rules = append(c.Rules, cachedRule{
			Section: string(r.Section), Key: r.Key, Order: r.Order, PlayerCounts: r.PlayerCounts,
			Optional: r.Optional, Title: r.Title, Text: r.Text,
		})
	}
	for _, s := range g.Sources {
		c.Sources = append(c.Sources, cachedSource{Title: s.Title, URL: s.URL})
	}
	for _, w := range g.Warnings {
		c.Warnings = append(c.Warnings, w)
	}
	return c
}

func (c cachedGame) toDomain() domain.Game {
	g := domain.Game{
		ID:             domain.GameID(c.ID),
		Name:           c.Name,
		LocalizedNames: c.LocalizedNames,
		Edition:        c.Edition,
		Publisher:      c.Publisher,
		Year:           c.Year,
		BGGID:          c.BGGID,
		Confidence:     domain.Confidence(c.Confidence),
		Players:        domain.Players{Min: c.PlayersMin, Max: c.PlayersMax, Recommended: c.PlayersRecommended},
		MinAge:         c.MinAge,
		Duration:       domain.Duration{Min: c.DurationMin, Max: c.DurationMax},
		Languages:      c.Languages,
		Description:    c.Description,
		TurnSummary:    c.TurnSummary,
		EndTiming:      c.EndTiming,
		EndWinner:      c.EndWinner,
		Categories:     c.Categories,
		ImageURL:       c.ImageURL,
		ArtKey:         c.ArtKey,
		ReviewStatus:   domain.ReviewStatus(c.ReviewStatus),
		GeneratedBy:    c.GeneratedBy,
	}
	for _, r := range c.Rules {
		g.Rules = append(g.Rules, domain.RuleItem{
			Section: domain.Section(r.Section), Key: r.Key, Order: r.Order, PlayerCounts: r.PlayerCounts,
			Optional: r.Optional, Title: r.Title, Text: r.Text,
		})
	}
	for _, s := range c.Sources {
		g.Sources = append(g.Sources, domain.Source{Title: s.Title, URL: s.URL})
	}
	for _, w := range c.Warnings {
		g.Warnings = append(g.Warnings, w)
	}
	return g
}

type cachedCandidate struct {
	Name      string `json:"name"`
	Edition   string `json:"edition,omitempty"`
	Publisher string `json:"publisher,omitempty"`
	Year      int    `json:"year,omitempty"`
	GameID    int64  `json:"game_id,omitempty"`
}

type cachedResolution struct {
	Barcode      string            `json:"barcode"`
	Status       string            `json:"status"`
	GameID       int64             `json:"game_id,omitempty"`
	EditionLabel string            `json:"edition_label,omitempty"`
	Source       string            `json:"source"`
	CheckedAt    time.Time         `json:"checked_at"`
	RetryAfter   time.Time         `json:"retry_after,omitzero"`
	Candidates   []cachedCandidate `json:"candidates,omitempty"`
}

func fromResolution(r domain.BarcodeResolution) cachedResolution {
	c := cachedResolution{
		Barcode:      string(r.Barcode),
		Status:       string(r.Status),
		GameID:       int64(r.GameID),
		EditionLabel: r.EditionLabel,
		Source:       string(r.Source),
		CheckedAt:    r.CheckedAt,
		RetryAfter:   r.RetryAfter,
	}
	for _, cand := range r.Candidates {
		c.Candidates = append(c.Candidates, cachedCandidate{
			Name: cand.Name, Edition: cand.Edition, Publisher: cand.Publisher, Year: cand.Year, GameID: int64(cand.GameID),
		})
	}
	return c
}

func (c cachedResolution) toDomain() domain.BarcodeResolution {
	r := domain.BarcodeResolution{
		Barcode:      domain.Barcode(c.Barcode),
		Status:       domain.BarcodeStatus(c.Status),
		GameID:       domain.GameID(c.GameID),
		EditionLabel: c.EditionLabel,
		Source:       domain.BarcodeSource(c.Source),
		CheckedAt:    c.CheckedAt,
		RetryAfter:   c.RetryAfter,
	}
	for _, cand := range c.Candidates {
		r.Candidates = append(r.Candidates, domain.Candidate{
			Name: cand.Name, Edition: cand.Edition, Publisher: cand.Publisher, Year: cand.Year, GameID: domain.GameID(cand.GameID),
		})
	}
	return r
}
