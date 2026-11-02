# Contrat d'API Meepleo

> Ce document reprend `docs/api-assumptions.md` de l'app Flutter et le met à jour avec ce que l'API implémente. La source de vérité technique est [`api/openapi.yaml`](../api/openapi.yaml), consultable sur `/docs` (Swagger UI). Les écarts avec l'app sont listés en fin de document.

## Le projet

**Meepleo** est une application mobile Flutter (iOS et Android) qui accompagne les joueurs de jeux de société avant, pendant et après une partie :
- ludothèque ;
- fiche de jeu et règles ;
- partie guidée et feuille de score ;
- assistant Meepy ;
- découverte ;
- profil.

On ajoute un jeu en scannant le code-barre de sa boîte.

## Statut

| Domaine | Statut côté API |
|---|---|
| Auth (`/auth/guest`, `/auth/refresh`, `/auth/logout`) | **implémenté** (module identity) |
| Catalogue (`/games/{id}`, `/games/{id}/rules`, `/catalog/barcode/{code}`) | **implémenté** (module catalog) |
| Recherche par nom (`/catalog/games`) | répond **501** : reportée jusqu'au branchement de BoardGameGeek |
| Ludothèque, parties, assistant, découvrir, profil, livret | décrits dans `openapi.yaml`, pas encore implémentés (404) |

## Conventions

| Sujet | Valeur |
|---|---|
| Format | REST, JSON |
| Casse des clés | `snake_case`, dans les corps comme dans les paramètres |
| Identifiants | chaînes (`"id": "42"`), à traiter comme opaques |
| Authentification | `Authorization: Bearer <access_token>` (JWT, 15 min) |
| Renouvellement | sur un 401 : `POST /auth/refresh` avec le refresh token, puis la requête est rejouée une fois. Si le renouvellement échoue (401), les jetons sont effacés et l'utilisateur revient à l'écran Bienvenue. **Ne lancer qu'un seul renouvellement à la fois** : le refresh token tourne à chaque appel |
| Langue | en-tête `Accept-Language` (fr ou en, défaut fr). Les textes (règles, libellés, messages d'erreur) sont renvoyés dans cette langue |
| Erreurs | code HTTP + `{ "message": "…", "code": "…" }` ; `message` est traduit et affichable, `code` est stable (par exemple `barcode_not_found`) |
| Pagination | `?page=1&page_size=20` → `{ "items": [...], "page": 1, "has_more": true }` |
| Dates | ISO 8601 en UTC |
| Ressource absente | `204 No Content` quand le contrat le prévoit (partie en cours, premier joueur) |
| Prix | aucun prix n'est renvoyé |
| Images | URLs CDN (`image_url`), repli sur `art_key` |
| Identifiant de requête | `X-Request-ID` renvoyé sur chaque réponse (à citer dans un rapport de bug) |

Correspondance des erreurs côté app (inchangée) :

| Cas | Failure |
|---|---|
| réseau | `NetworkFailure` |
| délai dépassé | `TimeoutFailure` |
| 401 | `UnauthorizedFailure` |
| 404 | `NotFoundFailure` |
| 400, 409, 422 | `ValidationFailure` |
| 5xx | `ServerFailure` |

L'API renvoie aussi 501 (fonctionnalité pas encore disponible) et 504 (délai serveur dépassé).

## Décisions

| Sujet | Décision |
|---|---|
| Authentification | JWT court + refresh token opaque **tournant**. Réutiliser un refresh token déjà échangé ferme la session (`refresh_token_reused`) |
| Code-barre | identification et fiche complète produites par un modèle d'IA (Claude avec recherche web), **en arrière-plan** par un worker, dans la limite d'un budget quotidien |
| Recherche par nom | reportée (BoardGameGeek) |
| Assistant | réponse REST complète |
| Dictée vocale | sur l'appareil, sans endpoint |
| Catégories | liste fermée de clés (`strategy`, `family`, `abstract`…), libellés traduits par l'API |
| Règles | structurées par section, avec les nombres de joueurs concernés |
| Premier joueur au hasard | tiré par l'app, envoyé dans `first_player_id` |

## Endpoints implémentés

### Auth

| Méthode | Chemin | Corps | Réponse |
|---|---|---|---|
| POST | `/auth/guest` (public) | — | `{ access_token, refresh_token }` |
| POST | `/auth/refresh` (public) | `{ refresh_token }` | `{ access_token, refresh_token }` ; 401 `invalid_refresh_token`, `refresh_token_expired` ou `refresh_token_reused` |
| POST | `/auth/logout` | — | 204 ; révoque tous les refresh tokens de l'utilisateur |

### Catalogue

| Méthode | Chemin | Réponse |
|---|---|---|
| GET | `/games/{id}` | `GameDto` ; 404 `game_not_found` |
| GET | `/games/{id}/rules` | **nouveau** `GameRulesDto` (ci-dessous) |
| GET | `/catalog/barcode/{code}` | **nouveau** `BarcodeLookupDto` (ci-dessous) |
| GET | `/catalog/games?q=` | 501 `search_unavailable` |

`GameDto` (inchangé) : `id, name, publisher, categories: [{id, label}], min_players, max_players, duration_minutes, min_age?, rules_status ("ready"|"preparing"), art_key?, image_url?, record?, is_favorite, play_count`.
- `name` est localisé.
- `is_favorite`, `play_count` et `record` valent pour l'instant `false`, `0` et absent, jusqu'à l'arrivée des modules ludothèque et parties.

#### Recherche par code-barre (changement)

Le code est un EAN-13, ou un UPC-A qui est normalisé en EAN-13 :
- **200** `{ "status": "found", "game": GameDto }` ;
- **200** `{ "status": "ambiguous", "candidates": [{ name, edition?, publisher?, year?, game_id? }] }` : l'utilisateur choisit ; `game_id` est présent si le jeu est déjà au catalogue ;
- **202** `{ "status": "pending", "retry_after_seconds": 20 }` : code inconnu, la fiche est en cours de génération. Rappeler le même endpoint après le délai ; chaque scan augmente la priorité du code ;
- **404** `barcode_not_found` (« Jeu introuvable ») ou `not_board_game` ;
- **400** `barcode_invalid` : chiffres ou clé de contrôle invalides.

Une génération prend généralement de 30 secondes à quelques minutes. Un code sans résultat est retenté automatiquement après 30 jours.

#### Règles (changement cassant)

```json
{
  "game_id": "1",
  "status": "ready",
  "summary": { "description": "…", "turn": "…", "end_timing": "…", "end_winner": "…" },
  "setup":        [{ "key": "setup-1", "text": "Placez 5 fabriques…", "player_counts": [2] }],
  "turn_steps":   [{ "key": "turn-1", "title": "Offre", "text": "…", "optional": false }],
  "special_rules": [], "end_triggers": [], "scoring": [], "tie_breakers": [],
  "warnings": ["…"],
  "sources": [{ "title": "BoardGameGeek", "url": "https://…" }],
  "booklet_pages": null,
  "booklet_downloaded": false
}
```

Précisions sur les champs :
- les listes vides valent `[]` ;
- `player_counts` est absent quand l'élément vaut pour toutes les configurations ;
- `optional` n'existe que sur `turn_steps` ;
- `sections: [string]` est **supprimé**.

## Endpoints à venir

Ils sont décrits dans `openapi.yaml`, avec les mêmes chemins et champs que le contrat initial, sans prix :
- ludothèque (`/library/*`) ;
- joueurs et parties (`/players`, `/matches/*`, `/games/{id}/first-player`) ;
- assistant (`/assistant/*`) ;
- découvrir (`/discover/*`) ;
- profil (`/me/profile`) ;
- livret (`/games/{id}/booklet/download`).

Restent à concevoir :
- la connexion à un compte existant ;
- le passage d'un compte invité à un compte complet ;
- l'import d'un livret ;
- Premium.

## Points ouverts

1. **Code-barre** : identification par recherche web retenue. La photo de la boîte, en complément, est à étudier si la qualité ne suffit pas. Plusieurs codes peuvent pointer vers la même fiche (une ligne par code dans `barcodes`).
2. **Relecture des fiches** : les fiches générées sont servies sans relecture humaine (`review_status: unreviewed`). Faut-il un avertissement dans l'app ?
3. **Notification de fin de génération** : polling pour l'instant ; une notification push est à envisager.
4. **Livret** : format de l'interprétation ; devenir du bouton « Télécharger le livret ».
5. **Libellés formatés** (`member_since_label`, `release_date_label`, `discount_label`) : supposés déjà formatés dans la langue demandée.
6. **Statistiques du profil**, **Premium**, **parcours « J'ai déjà un compte »** : à voir plus tard.

## Écarts entre ce contrat et l'app

À faire côté Flutter avant de brancher l'API :

- **Nouveau (contrat API)** : `GET /catalog/barcode/{code}` renvoie `BarcodeLookupDto` ; gérer le 202 (attente et relance), l'état `ambiguous` (choix parmi les candidats) et les codes 404.
- **Nouveau (cassant)** : remplacer `GameRulesDto.sections` par le format structuré et adapter l'écran des règles.
- **Nouveau** : lire `code` dans le corps d'erreur (optionnel, en plus de `message`).
- **Nouveau** : sérialiser les appels à `/auth/refresh` (un seul en vol), puisque le refresh token tourne.
- Ajouter l'en-tête `Accept-Language` dans le client Dio.
- Retirer `price_label` et `premium_price_label` des DTO, des fixtures et des écrans.
- Tirer le premier joueur dans l'app et l'envoyer à `POST /matches/{id}/start`.
- Mettre en cache les images CDN.
- Masquer l'onglet Rechercher tant que `/catalog/games` répond 501.
