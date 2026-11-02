# 0012. Champs personnels de GameDto reportés

Statut : accepté (2026-11-01)

## Contexte

`GameDto` contient `is_favorite`, `play_count` et `record`, qui appartiennent aux modules ludothèque et parties, pas encore écrits.

## Décision

Le catalogue renvoie pour l'instant `false`, `0` et `null`. Quand `library` et `matches` existeront, la composition passera par leurs `contract`, au moyen d'un port du catalogue implémenté par un adapter, ou d'un endpoint composé côté `library`. Le choix sera fait à ce moment-là.

## Conséquences

- Pas de dépendance prématurée entre modules.
- L'app affiche des valeurs neutres sur la fiche tant que ces modules n'existent pas.
