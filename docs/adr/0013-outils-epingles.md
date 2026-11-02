# 0013. Outils de génération épinglés via tools.mod

Statut : accepté (2026-11-01)

## Contexte

oapi-codegen, sqlc, goose et govulncheck doivent avoir la même version partout (développeurs, CI) sans alourdir le `go.mod` du service (sqlc tire beaucoup de dépendances).

## Décision

Les outils sont déclarés dans un fichier de module séparé, `tools.mod`, et lancés par `go tool -modfile=tools.mod <outil>` depuis le Makefile. golangci-lint est installé à part (binaire local, action GitHub), comme le recommande son projet.

## Conséquences

- Pas d'installation manuelle, versions reproductibles.
- La première exécution de sqlc compile l'outil (environ 30 s), ensuite il est en cache.
- La CI vérifie que `make generate` ne produit aucun diff.
