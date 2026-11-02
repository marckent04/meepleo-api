# 0011. Règles structurées dans GameRulesDto (changement cassant)

Statut : accepté (2026-11-01)

## Contexte

Le contrat initial exposait `sections: [string]`. Les fiches stockent des règles structurées par section, propres à un nombre de joueurs, en fr et en.

## Décision

- `GameRulesDto` expose `summary` (description, tour, fin, vainqueur) et une liste d'éléments par section (`setup`, `turn_steps`, `special_rules`, `end_triggers`, `scoring`, `tie_breakers`), chacun avec `key`, `title?`, `text`, `player_counts?` et `optional?` (tours seulement).
- S'y ajoutent `warnings` et `sources`.
- Tous les textes sont résolus dans la langue demandée, avec repli fr, puis en.
- `sections` est supprimé : ce choix est délibéré.

## Conséquences

- **Changement cassant** : le DTO et l'écran des règles de l'app Flutter doivent être mis à jour avant de brancher l'API.
- L'installation guidée pourra s'appuyer sur `player_counts` sans nouveau stockage.
