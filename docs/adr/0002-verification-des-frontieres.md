# 0002. Frontières vérifiées automatiquement (depguard + archcheck)

Statut : accepté (2026-11-01)

## Contexte

Des règles d'architecture écrites mais non vérifiées finissent par être contournées. go-arch-lint et depguard décrivent des composants par chemin, mais pas de règle relative au module du package (« `app` peut importer le `domain` de *son* module »), sauf à écrire une règle par module.

## Décision

- depguard (golangci-lint) pour les règles par chemin : `domain` et `contract` en stdlib stricte, liste noire pour `app`.
- Un outil maison, `tools/archcheck`, d'environ 150 lignes en stdlib, qui lit `go list -json` et applique les règles relatives au module, aux imports de test compris.
- Les deux tournent dans `make lint` et en CI.

## Conséquences

- Une violation casse la CI avec un message explicite ; elle a été testée volontairement (pgx dans un domaine, `app` d'un autre module).
- Ajouter un module ne demande aucune configuration supplémentaire.
- Un outil de plus à maintenir, couvert par ses propres tests.
