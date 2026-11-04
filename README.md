# Meepleo API

API REST NestJS 12 (Fastify) avec un cœur CQRS, une persistance Prisma 7 (PostgreSQL 17),
des DTO Zod et une documentation OpenAPI générée depuis les schémas Zod.

L'architecture, les règles de validation et la recette pour ajouter une feature sont décrites
dans [ARCHITECTURE.md](ARCHITECTURE.md).

## Prérequis

- Node 24, Yarn classic (1.x)
- Docker (pour PostgreSQL en local)

## Démarrage

```bash
cp .env.example .env
docker compose -f compose.dev.yml up
```

Cette commande démarre PostgreSQL, applique les migrations, joue le seed puis lance l'API en
mode watch.

Si tu préfères lancer l'API hors de Docker :

```bash
cp .env.example .env
docker compose -f compose.dev.yml up -d db   # POSTGRES_PORT=5433 si 5432 est déjà pris
yarn install
yarn db:deploy && yarn db:seed
yarn start:dev
```

| URL | Description |
|---|---|
| http://localhost:3000/v1/health | Contrôle de santé (API + base de données) |
| http://localhost:3000/docs | Swagger UI (hors production) |
| http://localhost:3000/docs-json | Document OpenAPI (hors production) |

Si une variable d'environnement manque ou est invalide, l'application refuse de démarrer et
affiche un message Zod qui liste les erreurs.

## Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `test` ou `production` |
| `PORT` | `3000` | Port HTTP |
| `DATABASE_URL` | — | URL `postgres://` ou `postgresql://` |
| `DB_POOL_MAX` | `10` | Taille max du pool de connexions |
| `LOG_LEVELS` | `warn,error` | Niveaux loggés, séparés par des virgules (`trace,debug,info,warn,error,fatal`) |
| `POSTGRES_PORT` | `5432` | Port publié par le PostgreSQL de `compose.dev.yml` |

## Commandes

| Commande | Rôle |
|---|---|
| `yarn start:dev` | API en mode watch |
| `yarn build` | `prisma generate` + compilation dans `dist/` |
| `yarn start:prod` | Lance `dist/main.js` |
| `yarn test` / `yarn test:watch` / `yarn test:cov` | Tests Vitest |
| `yarn lint-and-format` | Biome (lint + format, avec corrections) |
| `yarn db:generate` | Génère le client Prisma |
| `yarn db:migrate --name <change>` | Crée et applique une migration (développement uniquement) |
| `yarn db:deploy` | Applique les migrations en attente (CI, production) |
| `yarn db:seed` | Seed idempotent (upsert uniquement) |
| `yarn db:reset` | Recrée la base locale et rejoue migrations + seed |
| `yarn db:studio` | Prisma Studio |
| `yarn db:validate` | Valide le schéma Prisma et vérifie son formatage |

## Déploiement

L'image Docker a trois cibles :

- `migrate` : job one-shot `yarn db:deploy && yarn db:seed`, à lancer avant chaque déploiement ;
- `runtime` : image distroless Node 24 qui ne contient que `dist/` et les dépendances de
  production ;
- `builder` : étape intermédiaire.

L'application n'applique jamais les migrations au démarrage. `compose.prod.yml` montre
l'enchaînement migrate → api.

## CI

- `code_quality.yml` (à chaque pull request) appelle `quality.yml` : `biome ci`,
  `db:validate`, build et tests, plus un job qui applique les migrations sur une base vide,
  vérifie qu'aucune migration ne manque et joue le seed deux fois.
- `release.yml` (manuel) relance la qualité puis `semantic-release` sur `main` (Conventional
  Commits).
