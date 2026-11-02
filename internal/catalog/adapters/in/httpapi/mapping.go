package httpapi

import (
	"strconv"

	"github.com/meepleo/meepleo-api/internal/catalog/domain"
)

// Explicit mapping from the domain to the generated DTOs. Every localized text
// is resolved here, in the request language.

func optString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func optInt(n int) *int {
	if n <= 0 {
		return nil
	}
	return &n
}

func gameID(id domain.GameID) string { return strconv.FormatInt(int64(id), 10) }

func toGame(g domain.Game, lang string) Game {
	categories := make([]Category, 0, len(g.Categories))
	for _, c := range g.Categories {
		categories = append(categories, Category{Id: c, Label: categoryLabels.Get(lang, c)})
	}
	return Game{
		Id:              gameID(g.ID),
		Name:            g.DisplayName(lang),
		Publisher:       g.Publisher,
		Categories:      categories,
		MinPlayers:      g.Players.Min,
		MaxPlayers:      g.Players.Max,
		DurationMinutes: g.DurationMinutes(),
		MinAge:          optInt(g.MinAge),
		RulesStatus:     RulesStatus(g.RulesStatus()),
		ArtKey:          optString(g.ArtKey),
		ImageUrl:        optString(g.ImageURL),
		// Personal data (favorite, play count, record) belongs to the library
		// and matches modules; neutral values until they exist (ADR 0012).
		IsFavorite: false,
		PlayCount:  0,
		Record:     nil,
	}
}

func toRuleItems(items []domain.RuleItem, lang string) []RuleItem {
	out := make([]RuleItem, 0, len(items))
	for _, it := range items {
		dto := RuleItem{
			Key:   it.Key,
			Title: optString(it.Title.Resolve(lang)),
			Text:  it.Text.Resolve(lang),
		}
		if len(it.PlayerCounts) > 0 {
			counts := it.PlayerCounts
			dto.PlayerCounts = &counts
		}
		if it.Section == domain.SectionTurnStep {
			optional := it.Optional
			dto.Optional = &optional
		}
		out = append(out, dto)
	}
	return out
}

func toGameRules(g domain.Game, lang string) GameRules {
	warnings := make([]string, 0, len(g.Warnings))
	for _, w := range g.Warnings {
		if s := w.Resolve(lang); s != "" {
			warnings = append(warnings, s)
		}
	}
	sources := make([]Source, 0, len(g.Sources))
	for _, s := range g.Sources {
		sources = append(sources, Source{Title: s.Title, Url: s.URL})
	}
	return GameRules{
		GameId: gameID(g.ID),
		Status: RulesStatus(g.RulesStatus()),
		Summary: RulesSummary{
			Description: optString(g.Description.Resolve(lang)),
			Turn:        optString(g.TurnSummary.Resolve(lang)),
			EndTiming:   optString(g.EndTiming.Resolve(lang)),
			EndWinner:   optString(g.EndWinner.Resolve(lang)),
		},
		Setup:             toRuleItems(g.RulesIn(domain.SectionSetup), lang),
		TurnSteps:         toRuleItems(g.RulesIn(domain.SectionTurnStep), lang),
		SpecialRules:      toRuleItems(g.RulesIn(domain.SectionSpecialRule), lang),
		EndTriggers:       toRuleItems(g.RulesIn(domain.SectionEndTrigger), lang),
		Scoring:           toRuleItems(g.RulesIn(domain.SectionScoring), lang),
		TieBreakers:       toRuleItems(g.RulesIn(domain.SectionTieBreaker), lang),
		Warnings:          warnings,
		Sources:           sources,
		BookletDownloaded: false, // owned by the future booklet module
	}
}

func toCandidates(cs []domain.Candidate) *[]BarcodeCandidate {
	out := make([]BarcodeCandidate, 0, len(cs))
	for _, c := range cs {
		dto := BarcodeCandidate{
			Name:      c.Name,
			Edition:   optString(c.Edition),
			Publisher: optString(c.Publisher),
			Year:      optInt(c.Year),
		}
		if c.GameID > 0 {
			id := gameID(c.GameID)
			dto.GameId = &id
		}
		out = append(out, dto)
	}
	return &out
}
