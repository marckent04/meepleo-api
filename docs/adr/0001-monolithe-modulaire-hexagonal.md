# 0001. Monolithe modulaire hexagonal

Statut : accepté (2026-11-01)

## Contexte

L'API va grossir en fonctionnalités, en modules et en développeurs. Un monolithe sans frontières devient vite un plat de spaghettis ; des microservices dès le départ coûtent cher (déploiement, réseau, cohérence) pour une équipe et un trafic encore petits.

## Décision

Un seul binaire, découpé en modules par contexte métier sous `internal/<module>/`. Chaque module suit l'architecture hexagonale : `domain` (stdlib uniquement), `app` (cas d'usage et ports déclarés côté consommateur), `adapters/in` et `adapters/out`, `contract` (API publique) et `module.go` (câblage). La composition root (`cmd/*/main.go`) câble tout à la main, sans framework d'injection.

## Conséquences

- Un seul déploiement et une seule base, avec des frontières aussi strictes que celles de services séparés.
- Plus de fichiers et de mapping explicite qu'une approche en couches techniques ; c'est le prix de domaines indépendants des frameworks.
- Extraire un module reste possible sans réécrire ses consommateurs (voir docs/architecture.md).
