# Meepleo API

API REST de Meepleo, en Go. Architecture hexagonale dans un monolithe modulaire, contrat spec-first (`api/openapi.yaml`), PostgreSQL, Redis, OpenTelemetry.

- Architecture, règles de dépendance, ajout d'un module, extraction : [docs/architecture.md](docs/architecture.md)
- Décisions : [docs/adr/](docs/adr/README.md)
- Contrat pour l'app mobile : [docs/api-contract.md](docs/api-contract.md), et Swagger UI sur `/docs`
- Règles de contribution : [CLAUDE.md](CLAUDE.md)

## Démarrer

Prérequis : Go 1.26, Docker, golangci-lint v2.

```sh
cp .env.example .env        # changer les ports si 5432 ou 6379 sont pris
make up migrate seed        # Postgres + Redis, migrations, données de démo
make run                    # API sur :8080, Swagger UI sur http://localhost:8080/docs
make run-worker             # génération des fiches (ANTHROPIC_API_KEY requise)
```

Essai rapide :

```sh
TOKEN=$(curl -s -X POST localhost:8080/auth/guest | jq -r .access_token)
curl -s -H "Authorization: Bearer $TOKEN" -H "Accept-Language: en" localhost:8080/catalog/barcode/3558380077619
curl -s -H "Authorization: Bearer $TOKEN" localhost:8080/games/1/rules
```

## Commandes

| Commande | Rôle |
|---|---|
| `make generate` | oapi-codegen (un package par module) et sqlc |
| `make lint` | golangci-lint et vérification des frontières (`tools/archcheck`) |
| `make test` | tests unitaires |
| `make test-int` | tests d'intégration et e2e (testcontainers, Docker requis) |
| `make migrate` | migrations de tous les modules |
| `make build` | binaires `api`, `worker` et `migrate` dans `bin/` |
| `make docker-build` | image (distroless, non-root) |
| `make vuln` | govulncheck |

## Binaires

| Binaire | Rôle |
|---|---|
| `api` | serveur HTTP ; sondes `/healthz` et `/readyz` |
| `worker` | génère en arrière-plan les fiches des codes-barres inconnus, dans la limite de `GENERATION_DAILY_BUDGET` |
| `migrate` | applique les migrations ; à lancer comme job avant chaque déploiement |

Les trois sont dans la même image. Le point d'entrée par défaut est `api` ; pour les autres, surcharger l'entrypoint (`/usr/local/bin/worker`, `/usr/local/bin/migrate`).
