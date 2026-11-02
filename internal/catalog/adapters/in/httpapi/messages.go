package httpapi

import "github.com/meepleo/meepleo-api/internal/platform/i18n"

// Error codes of the catalog API (stable, for clients).
const (
	codeGameNotFound    = "game_not_found"
	codeBarcodeInvalid  = "barcode_invalid"
	codeBarcodeNotFound = "barcode_not_found"
	codeNotBoardGame    = "not_board_game"
	codeSearchDisabled  = "search_unavailable"
	codeInvalidRequest  = "invalid_request"
)

// messages holds the user-facing texts of the catalog, by language.
var messages = i18n.Catalog{
	codeGameNotFound: {
		i18n.French:  "Ce jeu est introuvable.",
		i18n.English: "This game could not be found.",
	},
	codeBarcodeInvalid: {
		i18n.French:  "Ce code-barre n'est pas valide. Scanne le code EAN ou UPC imprimé sur la boîte.",
		i18n.English: "This barcode is not valid. Scan the EAN or UPC code printed on the box.",
	},
	codeBarcodeNotFound: {
		i18n.French:  "Jeu introuvable pour ce code-barre.",
		i18n.English: "No game found for this barcode.",
	},
	codeNotBoardGame: {
		i18n.French:  "Ce code-barre ne correspond pas à un jeu de société.",
		i18n.English: "This barcode is not a board game.",
	},
	codeSearchDisabled: {
		i18n.French:  "La recherche par nom n'est pas encore disponible. Scanne le code-barre de la boîte.",
		i18n.English: "Search by name is not available yet. Scan the barcode on the box.",
	},
	codeInvalidRequest: {
		i18n.French:  "La requête est invalide.",
		i18n.English: "The request is invalid.",
	},
}

// categoryLabels translates the domain category keys.
var categoryLabels = i18n.Catalog{
	"abstract":         {i18n.French: "Abstrait", i18n.English: "Abstract"},
	"area_control":     {i18n.French: "Contrôle de territoire", i18n.English: "Area control"},
	"bluffing":         {i18n.French: "Bluff", i18n.English: "Bluffing"},
	"card":             {i18n.French: "Cartes", i18n.English: "Card game"},
	"cooperative":      {i18n.French: "Coopératif", i18n.English: "Cooperative"},
	"deck_building":    {i18n.French: "Construction de deck", i18n.English: "Deck building"},
	"deduction":        {i18n.French: "Déduction", i18n.English: "Deduction"},
	"dexterity":        {i18n.French: "Adresse", i18n.English: "Dexterity"},
	"dice":             {i18n.French: "Dés", i18n.English: "Dice"},
	"economic":         {i18n.French: "Économie", i18n.English: "Economic"},
	"family":           {i18n.French: "Famille", i18n.English: "Family"},
	"kids":             {i18n.French: "Enfants", i18n.English: "Kids"},
	"legacy":           {i18n.French: "Legacy", i18n.English: "Legacy"},
	"party":            {i18n.French: "Ambiance", i18n.English: "Party"},
	"puzzle":           {i18n.French: "Réflexion", i18n.English: "Puzzle"},
	"strategy":         {i18n.French: "Stratégie", i18n.English: "Strategy"},
	"thematic":         {i18n.French: "Thématique", i18n.English: "Thematic"},
	"trivia":           {i18n.French: "Culture générale", i18n.English: "Trivia"},
	"word":             {i18n.French: "Lettres", i18n.English: "Word game"},
	"worker_placement": {i18n.French: "Placement d'ouvriers", i18n.English: "Worker placement"},
}
