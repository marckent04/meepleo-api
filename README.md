# Meepleo API

NestJS 12 (Fastify) REST API with a CQRS core, Prisma 7 persistence (PostgreSQL 17),
Zod DTOs and an OpenAPI documentation generated from the Zod schemas.

The architecture, the validation rules and the recipe for adding a feature are described
in [ARCHITECTURE.md](ARCHITECTURE.md).

## Requirements

- Node 24, Yarn classic (1.x)
- Docker (for PostgreSQL locally)

## Getting started

```bash
cp .env.example .env
docker compose -f compose.dev.yml up
```

This command starts PostgreSQL, applies the migrations, runs the seed, then starts the API in
watch mode.

If you prefer to run the API outside Docker:

```bash
cp .env.example .env
docker compose -f compose.dev.yml up -d db   # POSTGRES_PORT=5433 if 5432 is already taken
yarn install
yarn db:deploy && yarn db:seed
yarn start:dev
```

| URL | Description |
|---|---|
| http://localhost:3000/v1/health | Health check (API + database) |
| http://localhost:3000/docs | Swagger UI (non-production only) |
| http://localhost:3000/docs-json | OpenAPI document (non-production only) |

If an environment variable is missing or invalid, the application refuses to start and
prints a Zod message listing the errors.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `test` or `production` |
| `PORT` | `3000` | HTTP port |
| `DATABASE_URL` | — | `postgres://` or `postgresql://` URL |
| `DB_POOL_MAX` | `10` | Maximum size of the connection pool |
| `LOG_LEVELS` | `warn,error` | Logged levels, comma-separated (`trace,debug,info,warn,error,fatal`) |
| `POSTGRES_PORT` | `5432` | Port published by the PostgreSQL of `compose.dev.yml` |

## Commands

| Command | Purpose |
|---|---|
| `yarn start:dev` | API in watch mode |
| `yarn build` | `prisma generate` + compilation into `dist/` |
| `yarn start:prod` | Runs `dist/main.js` |
| `yarn test` / `yarn test:watch` / `yarn test:cov` | Vitest tests |
| `yarn lint-and-format` | Biome (lint + format, with fixes) |
| `yarn db:generate` | Generates the Prisma client |
| `yarn db:migrate --name <change>` | Creates and applies a migration (development only) |
| `yarn db:deploy` | Applies pending migrations (CI, production) |
| `yarn db:seed` | Idempotent seed (upsert only) |
| `yarn db:reset` | Recreates the local database and replays migrations + seed |
| `yarn db:studio` | Prisma Studio |
| `yarn db:validate` | Validates the Prisma schema and checks its formatting |

## Deployment

The Docker image has three targets:

- `migrate`: one-shot job `yarn db:deploy && yarn db:seed`, to run before each deployment;
- `runtime`: distroless Node 24 image containing only `dist/` and the production
  dependencies;
- `builder`: intermediate stage.

The application never applies migrations at startup. `compose.prod.yml` shows the
migrate → api sequence.

## CI

- `code_quality.yml` (on every pull request) calls `quality.yml`: `biome ci`,
  `db:validate`, build and tests, plus a job that applies the migrations on an empty database,
  checks that no migration is missing and runs the seed twice.
- `release.yml` (manual) re-runs the quality checks then `semantic-release` on `main` (Conventional
  Commits).
