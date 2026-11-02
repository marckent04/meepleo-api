package domain

import "slices"

// Categories is the closed list of game category keys. The generator must
// pick from it and the API translates each key into a label, so categories
// stay consistent across sheets and filterable.
var Categories = []string{
	"abstract", "area_control", "bluffing", "card", "cooperative", "deck_building",
	"deduction", "dexterity", "dice", "economic", "family", "kids", "legacy",
	"party", "puzzle", "strategy", "thematic", "trivia", "word", "worker_placement",
}

// IsCategory reports whether key is a known category.
func IsCategory(key string) bool {
	return slices.Contains(Categories, key)
}
