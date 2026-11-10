# Meepleo API

NestJS 12 (Fastify) REST API with a CQRS core, Prisma 7 persistence (PostgreSQL 17),
Zod DTOs and an OpenAPI documentation generated from the Zod schemas.

The architecture, the validation rules and the recipe for adding a feature are described
in [ARCHITECTURE.md](ARCHITECTURE.md).

## Requirements

- Node 24, pnpm (version pinned by the `packageManager` field, via Corepack)
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
pnpm install
pnpm db:deploy && pnpm db:seed
pnpm start:dev
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
| `pnpm start:dev` | API in watch mode |
| `pnpm build` | `prisma generate` + compilation into `dist/` |
| `pnpm start:prod` | Runs `dist/main.js` |
| `pnpm test` / `pnpm test:watch` / `pnpm test:cov` | Vitest tests |
| `pnpm lint-and-format` | Biome (lint + format, with fixes) |
| `pnpm db:generate` | Generates the Prisma client |
| `pnpm db:migrate --name <change>` | Creates and applies a migration (development only) |
| `pnpm db:deploy` | Applies pending migrations (CI, production) |
| `pnpm db:seed` | Idempotent seed (upsert only) |
| `pnpm db:reset` | Recreates the local database and replays migrations + seed |
| `pnpm db:studio` | Prisma Studio |
| `pnpm db:validate` | Validates the Prisma schema and checks its formatting |

## Deployment

The Docker image has three targets:

- `migrate`: one-shot job `pnpm db:deploy && pnpm db:seed`, to run before each deployment;
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
