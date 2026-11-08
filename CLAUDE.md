# CLAUDE.md

Meepleo REST API: NestJS 12 + Fastify + CQRS + Prisma (PostgreSQL) + Zod. Node >= 24, Yarn.

Full details live in [ARCHITECTURE.md](ARCHITECTURE.md). This file is the short list of rules
you must follow when changing the code. **Respect the existing structure and conventions; do
not introduce new patterns, folders or libraries without being asked.** When in doubt, copy
how an existing feature (e.g. `favorites`, `wishlist`) is built.

## Language: everything in English

All code and everything written around it must be in **English**:

- identifiers (variables, functions, classes, files, folders, Prisma models/columns);
- code comments and JSDoc;
- Swagger / OpenAPI documentation: `@ApiTags`, summaries, descriptions, and every Zod
  `.describe()` / `.meta()` on DTO fields;
- error messages thrown in code (`AppError` messages are only logged), log messages, test
  names (`describe` / `it`);
- commit messages (Conventional Commits, see the `commit-message` skill), PR descriptions,
  README / docs you add or edit.

The only exception is end-user translation content in `src/i18n/{fr,en}/*.json`, where the
`fr` file is naturally French. Existing French comments or docs you touch should be translated
to English.

## Commands

```
yarn start:dev          # run with watch
yarn build              # prisma generate + nest build
yarn test               # vitest run
yarn lint-and-format    # biome check --write (run before finishing)
yarn db:migrate --name <change>   # dev migration (review the generated SQL)
yarn db:deploy          # CI / production migrations
```

Always run `yarn lint-and-format` and `yarn test` (and `yarn build` for structural changes)
before considering a task done.

## Layout and dependency direction

```
src/
├── api/              HTTP transport only
│   ├── common/       throttling, exception filter, interceptors, errors, guards, decorators
│   └── rest/         controllers, Zod DTOs, validation, Swagger
├── domain/<feature>/ commands/, queries/, handlers/, index.ts  (one folder per feature)
├── infrastructure/   database (Prisma), logger, i18n, external adapters (auth, anthropic)
├── shared/           Zod config, errors, locales, domain models (shared/types); no dependencies
├── utils/            AppCommandHandler / AppQueryHandler
└── i18n/{fr,en}/     translations (errors.json, validation.json)
```

Dependencies go one way: `api` -> `domain` -> `infrastructure`. `shared` depends on nothing.

- Controllers contain **no business logic**: translate request -> Command/Query, dispatch on
  the CQRS bus, map the result to a response DTO (`XxxResponseDto.fromDomain`).
- Only `infrastructure/database/` knows Prisma. Never import generated types
  (`infrastructure/database/generated/`) elsewhere (Biome enforces it). `api/` never imports
  `infrastructure/database`.
- Handlers return **domain models** from `shared/types`, never Prisma records or DTOs.
- Handlers never inject `PrismaService`; repositories always use `this.txHost.tx.<model>`.
- Repository methods have explicit names and narrow signatures (never accept a Prisma `where`)
  and every read filters `deletedAt: null`. Writes go through `rethrowPrismaError`.
- Mappers (`database/mappers/<model>.mapper.ts`) are the only place converting Prisma records
  to domain models.
- Barrel `index.ts` files are used at every level; new repositories, handlers and DTOs must be
  exported from their barrel and registered like the existing ones (see the recipe in
  ARCHITECTURE.md).

## Validation

| Zone | Tool |
|---|---|
| Config (`shared/config/*`, `prisma.config.ts`) | Zod only, via `parseEnv`; `process.env` is read nowhere else |
| REST (`api/rest/**`): body, params, query, responses | Zod only (`nestjs-zod`, `createZodDto`) |
| Domain Commands / Queries | class-validator decorators (every Command/Query needs them) |

- No class-validator in `api/rest/` or config, no manual `@ApiProperty` on Zod DTOs, and every
  DTO field must have a `.describe()` (written in English).
- No `.meta({ id })` on the root schema of a response DTO.

## Errors

- Throw an `AppError` subclass (`NotFoundError`, `ConflictError`, `BusinessRuleError`, ...);
  never return `null` for a resource that should exist.
- New error code: add it to `ERROR_CODES` (never rename or remove one), add its message to
  both `src/i18n/fr/errors.json` and `src/i18n/en/errors.json`, then throw with
  `{ code: ErrorCode.X }`. `translations.spec.ts` fails if a translation is missing.
- Document route errors with `@ApiErrorResponses(...)`; use `@ErrorCodeOnFailure(code)` to
  replace a generic 500 with a business code.

## Prisma

- Models: singular `PascalCase` + `@@map("snake_case_plural")`; columns `@map("snake_case")`;
  ids `String @id @db.Uuid`; dates `DateTime @db.Timestamptz(6)`; soft delete via `deletedAt`.
- Never edit an already applied migration. Never `db push` / `migrate dev` outside
  development. The app never migrates at startup.
- `prisma/seed.ts` only uses `upsert` (idempotent).

## Code style (Biome)

Single quotes, no semicolons, trailing commas, 2 spaces, 80 columns, no `any`, no
`console.log` (use `LoggerService`), no `public` modifier on class members, `node:` import
protocol. Each handler has a `*.handler.spec.ts`; each repository / mapper has its spec.

## Adding a feature

Follow the "Recipe: add a REST feature" in [ARCHITECTURE.md](ARCHITECTURE.md) step by step
(Prisma model -> domain type -> mapper -> repository -> commands/queries -> handlers ->
`DomainModule` registration -> error codes + translations -> DTO + controller `version: '1'`
-> config if needed).
