package postgres

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/meepleo/meepleo-api/internal/catalog/adapters/out/postgres/sqlcgen"
	"github.com/meepleo/meepleo-api/internal/catalog/domain"
)

// Explicit mapping between the sqlc models and the domain. The domain has no
// db tags; every NULL convention is decided here.

func text(s string) pgtype.Text { return pgtype.Text{String: s, Valid: s != ""} }

func int2(n int) pgtype.Int2 { return pgtype.Int2{Int16: int16(n), Valid: n > 0} } //nolint:gosec // bounded by domain validation

func int4(n int) pgtype.Int4 { return pgtype.Int4{Int32: int32(n), Valid: n > 0} } //nolint:gosec // bounded by domain validation

func int8(id domain.GameID) pgtype.Int8 { return pgtype.Int8{Int64: int64(id), Valid: id > 0} }

func timestamptz(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: !t.IsZero()}
}

func fromTimestamptz(t pgtype.Timestamptz) time.Time {
	if !t.Valid {
		return time.Time{}
	}
	return t.Time
}

func ints16(in []int) []int16 {
	if in == nil {
		return nil
	}
	out := make([]int16, len(in))
	for i, v := range in {
		out[i] = int16(v) //nolint:gosec // player counts are small
	}
	return out
}

func fromInts16(in []int16) []int {
	if len(in) == 0 {
		return nil
	}
	out := make([]int, len(in))
	for i, v := range in {
		out[i] = int(v)
	}
	return out
}

// localizedJSON encodes a text for a NOT NULL JSONB column.
func localizedJSON(t domain.LocalizedText) ([]byte, error) {
	if t == nil {
		t = domain.LocalizedText{}
	}
	return json.Marshal(map[string]string(t))
}

// nullableLocalizedJSON encodes a text for a nullable JSONB column: an empty
// text is stored as NULL.
func nullableLocalizedJSON(t domain.LocalizedText) ([]byte, error) {
	if t.IsZero() {
		return nil, nil
	}
	return json.Marshal(map[string]string(t))
}

func fromLocalizedJSON(b []byte) (domain.LocalizedText, error) {
	if len(b) == 0 {
		return nil, nil
	}
	var m map[string]string
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, fmt.Errorf("decode localized text: %w", err)
	}
	return domain.LocalizedText(m), nil
}

func gameParams(g domain.Game, raw []byte) (sqlcgen.InsertGameParams, error) {
	var err error
	p := sqlcgen.InsertGameParams{
		Name:               g.Name,
		Edition:            text(g.Edition),
		Publisher:          text(g.Publisher),
		Year:               int2(g.Year),
		BggID:              int4(g.BGGID),
		Confidence:         sqlcgen.CatalogConfidenceLevel(g.Confidence),
		PlayersMin:         int16(g.Players.Min), //nolint:gosec // validated by domain.NewGame
		PlayersMax:         int16(g.Players.Max), //nolint:gosec // validated by domain.NewGame
		PlayersRecommended: ints16(g.Players.Recommended),
		MinAge:             int2(g.MinAge),
		DurationMin:        int2(g.Duration.Min),
		DurationMax:        int2(g.Duration.Max),
		Languages:          g.Languages,
		Categories:         g.Categories,
		ImageUrl:           text(g.ImageURL),
		ArtKey:             text(g.ArtKey),
		ReviewStatus:       sqlcgen.CatalogReviewStatus(g.ReviewStatus),
		GeneratedBy:        text(g.GeneratedBy),
		RawJson:            raw,
	}
	if p.PlayersRecommended == nil {
		p.PlayersRecommended = []int16{}
	}
	if p.Categories == nil {
		p.Categories = []string{}
	}
	if p.LocalizedNames, err = localizedJSON(g.LocalizedNames); err != nil {
		return p, err
	}
	if p.Description, err = localizedJSON(g.Description); err != nil {
		return p, err
	}
	if p.TurnSummary, err = nullableLocalizedJSON(g.TurnSummary); err != nil {
		return p, err
	}
	if p.EndTiming, err = nullableLocalizedJSON(g.EndTiming); err != nil {
		return p, err
	}
	if p.EndWinner, err = nullableLocalizedJSON(g.EndWinner); err != nil {
		return p, err
	}
	return p, nil
}

func toGame(row sqlcgen.GetGameRow) (domain.Game, error) {
	g := domain.Game{
		ID:           domain.GameID(row.ID),
		Name:         row.Name,
		Edition:      row.Edition.String,
		Publisher:    row.Publisher.String,
		Year:         int(row.Year.Int16),
		BGGID:        int(row.BggID.Int32),
		Confidence:   domain.Confidence(row.Confidence),
		Players:      domain.Players{Min: int(row.PlayersMin), Max: int(row.PlayersMax), Recommended: fromInts16(row.PlayersRecommended)},
		MinAge:       int(row.MinAge.Int16),
		Duration:     domain.Duration{Min: int(row.DurationMin.Int16), Max: int(row.DurationMax.Int16)},
		Languages:    row.Languages,
		Categories:   row.Categories,
		ImageURL:     row.ImageUrl.String,
		ArtKey:       row.ArtKey.String,
		ReviewStatus: domain.ReviewStatus(row.ReviewStatus),
		GeneratedBy:  row.GeneratedBy.String,
	}
	var err error
	for _, f := range []struct {
		dst *domain.LocalizedText
		src []byte
	}{
		{&g.LocalizedNames, row.LocalizedNames},
		{&g.Description, row.Description},
		{&g.TurnSummary, row.TurnSummary},
		{&g.EndTiming, row.EndTiming},
		{&g.EndWinner, row.EndWinner},
	} {
		if *f.dst, err = fromLocalizedJSON(f.src); err != nil {
			return domain.Game{}, err
		}
	}
	return g, nil
}

func toRuleItem(row sqlcgen.ListRuleItemsRow) (domain.RuleItem, error) {
	title, err := fromLocalizedJSON(row.Title)
	if err != nil {
		return domain.RuleItem{}, err
	}
	txt, err := fromLocalizedJSON(row.Text)
	if err != nil {
		return domain.RuleItem{}, err
	}
	return domain.RuleItem{
		Section:      domain.Section(row.Section),
		Key:          row.ItemKey,
		Order:        int(row.SortOrder.Int16),
		PlayerCounts: fromInts16(row.PlayerCounts),
		Optional:     row.Optional.Valid && row.Optional.Bool,
		Title:        title,
		Text:         txt,
	}, nil
}

func ruleItemParams(id int64, r domain.RuleItem) (sqlcgen.InsertRuleItemParams, error) {
	title, err := nullableLocalizedJSON(r.Title)
	if err != nil {
		return sqlcgen.InsertRuleItemParams{}, err
	}
	txt, err := localizedJSON(r.Text)
	if err != nil {
		return sqlcgen.InsertRuleItemParams{}, err
	}
	return sqlcgen.InsertRuleItemParams{
		GameID:       id,
		Section:      sqlcgen.CatalogRuleSection(r.Section),
		ItemKey:      r.Key,
		SortOrder:    int2(r.Order),
		PlayerCounts: ints16(r.PlayerCounts),
		// optional is only meaningful for turn steps (NULL elsewhere).
		Optional: pgtype.Bool{Bool: r.Optional, Valid: r.Section == domain.SectionTurnStep},
		Title:    title,
		Text:     txt,
	}, nil
}

func toResolution(row sqlcgen.CatalogBarcode) domain.BarcodeResolution {
	return domain.BarcodeResolution{
		Barcode:      domain.Barcode(row.Barcode),
		Status:       domain.BarcodeStatus(row.Status),
		GameID:       domain.GameID(row.GameID.Int64),
		EditionLabel: row.EditionLabel.String,
		Source:       domain.BarcodeSource(row.Source),
		CheckedAt:    fromTimestamptz(row.CheckedAt),
		RetryAfter:   fromTimestamptz(row.RetryAfter),
	}
}
