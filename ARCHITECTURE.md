# Architecture

## Guiding principle

Transport adapters (REST controllers) **never** contain business logic.
They translate a request into a Command/Query, dispatch it on the CQRS bus, then translate
the result into a response DTO. Everything that decides *what happens* lives in `domain/`.

## Layers

```
src/
├── api/              HTTP transport
│   ├── common/       cross-cutting: throttling, exception filter, interceptors, errors
│   └── rest/         controllers, Zod DTOs, validation, Swagger
├── domain/           Commands, Queries, handlers (one folder per feature)
├── infrastructure/   database (Prisma), logger, i18n, external adapters
├── shared/           Zod config, errors, locales, domain models (no dependency)
├── utils/            AppCommandHandler / AppQueryHandler
└── i18n/{fr,en}/     translations (errors.json, validation.json)
```

Dependencies go in a single direction: `api` → `domain` → `infrastructure`. `shared` depends on
nothing and can be imported anywhere.

- Only `infrastructure/database/` knows Prisma. No generated type
  (`infrastructure/database/generated/`) is imported elsewhere: Biome rejects it
  (`noRestrictedImports`).
- `api/` never imports `infrastructure/database`.
- Handlers return **domain models** (`shared/types`), never a Prisma record nor a DTO.
- Transport modules do not import `DomainModule`: the bus is global
  (`CqrsModule.forRoot()` in `InfrastructureModule`).

## Validation rule

| Zone | Tool |
|---|---|
| Configuration (`shared/config/*`, `database.config.ts`, `prisma.config.ts`) | Zod only, via `parseEnv` |
| REST (`api/rest/**`): body, params, query string, responses, errors | Zod only (`nestjs-zod`); the Swagger doc comes from the schemas (`.describe()`, `.meta()`) |
| Domain (Commands / Queries) | class-validator: a transport-independent safety net |

Joi and TypeORM are not installed. `process.env` is only read in the Zod config files.

A validation error always produces the same response, whichever library detected it:
`400 VALIDATION_FAILED` with translated `fields`. Zod yields `zod.<issue code>` constraints,
class-validator yields `isEmail`, `min`, etc. constraints. All are translated in
`validation.json`.

## Errors

- `shared/errors/error-codes.ts` is the contractual inventory of codes: codes are added, never
  renamed or removed.
- Throw an `AppError` (`NotFoundError`, `ConflictError`, `BusinessRuleError`…). Its message is
  only logged: the client receives the translated message associated with the code.
- `AppExceptionFilter` is the only place that logs a request error. It responds with the
  real HTTP status and the `ErrorResponseDto` body `{ code, message, fields?, correlationId }`,
  translated according to `Accept-Language` (`fr` by default, `en`).
- `@ErrorCodeOnFailure(code)` replaces a route's generic `INTERNAL_SERVER_ERROR` with a
  business code, and leaves client errors untouched.
- `@ApiErrorResponses(400, 404, …)` documents a route's errors in Swagger.

To add an error: add the code to `ERROR_CODES`, then its message in
`fr/errors.json` and `en/errors.json`, then throw `new NotFoundError('…', { code: ErrorCode.X })`.
`translations.spec.ts` fails if a translation is missing.

## Prisma persistence

- The schema is in `prisma/schema.prisma`. The URL comes from `prisma.config.ts`, which reuses
  the application's Zod validation (`loadDatabaseEnv`) and loads `.env` if it exists.
- The client is generated in `src/infrastructure/database/generated/` (gitignored) and
  `PrismaService` instantiates it with the `@prisma/adapter-pg` driver adapter.
- Conventions: singular `PascalCase` models, `@@map("plural_snake_case")`, `@map("snake_case")`
  columns, `String @id @db.Uuid` ids, `DateTime @db.Timestamptz(6)` dates, soft
  delete via `deletedAt DateTime?`.
- Mappers (`database/mappers/<model>.mapper.ts`) are the **only** place that converts a Prisma
  record into a domain model. Generated types are aliased there as `XxxRecord`.
- Repositories **always** go through `this.txHost.tx.<model>` (`TransactionHost` from
  `@nestjs-cls/transactional`). Outside a transaction it is the regular client; inside a
  `@Transactional()` handler it is the transaction client. No `tx` parameter is passed around.
- Repository methods have an explicit name and a narrow signature. They never accept a Prisma
  `where` coming from the caller. Every read filters `deletedAt: null`.
- `rethrowPrismaError` translates known errors (`P2002` → `ConflictError`, `P2025` →
  `NotFoundError`, `P2003` → `BadRequestError`).
- Migrations: `yarn db:migrate --name <change>` in development (review the SQL and commit it),
  `yarn db:deploy` in CI and production. The application never migrates at startup.
- `prisma/seed.ts` only does `upsert`s: it can be replayed at will.

## Logs

- `LoggerService` (transient): `setContext(name)`, `trace` … `fatal`, `assign(fields)` to
  add fields to all the request's logs. Every log carries the `correlationId`, taken
  from `x-correlation-id` / `x-request-id` or generated.
- `LOG_LEVELS` sets the exact set of emitted levels. Levels are mapped to the Cloud Logging
  `severity`. Output is `pino-pretty` in development, JSON elsewhere.
- `redactSecrets` masks sensitive keys before logging `details`.
- `console.log` is forbidden (Biome `noConsole`).

## Recipe: add a REST feature

Example with a `Tag` aggregate:

1. Add the `Tag` model to `prisma/schema.prisma` (`@@map`, `@map`, indexes), then run
   `yarn db:migrate --name add-tag` and review the generated SQL.
2. Create the domain model `shared/types/tag.type.ts` (pure class) and export it from
   `shared/types/index.ts`.
3. Create the mapper `infrastructure/database/mappers/tag.mapper.ts`
   (`toTag(record: TagRecord)`) with its barrel `mappers/index.ts`.
4. Create the repository `infrastructure/database/repositories/tag.repository.ts`
   (`txHost.tx.tag`, `rethrowPrismaError` on writes) and export it from the barrel:
   it is registered automatically by `Object.values(repositories)`.
5. Create the Commands / Queries `domain/tag/{commands,queries}/*.ts` (class-validator
   decorators, parameter-object constructor) with their barrels.
6. Create the handlers `domain/tag/handlers/*.handler.ts` (`AppCommandHandler` /
   `AppQueryHandler`, `@Transactional()` if there are several writes), one `*.handler.spec.ts`
   per handler, and the barrel.
7. Create `domain/tag/index.ts`, add `export * from './tag'` to `domain/index.ts` and
   `...Object.values(tagHandlers)` to `DomainModule`.
8. Add the error codes to `ERROR_CODES` and their `fr` / `en` translations.
9. REST: create `api/rest/dto/tag.dto.ts` (described Zod schemas, `createZodDto`, `fromDomain`)
   and `api/rest/controllers/tag.controller.ts` (`@ApiTags`, `@ZodResponse`,
   `@ApiErrorResponses`, `version: '1'`), then export them from their barrels.
10. If the feature needs environment variables, create `shared/config/tag.config.ts`
    (Zod schema + `parseEnv` + `registerAs`) and complete `.env.example`.

In a response DTO, do not put `.meta({ id })` on the root schema: with `@nestjs/swagger` 12,
`cleanupOpenApiDoc` would duplicate it. The OpenAPI component takes the name of the DTO class.
`.meta({ example })` on fields is fine.

## Forbidden anti-patterns

- A controller that calls a repository or `PrismaService`, or that contains business
  logic.
- A handler that injects `PrismaService` or manipulates a transaction client.
- A handler that returns a Prisma record or a DTO.
- A generated Prisma type imported outside `infrastructure/database/`.
- `this.prisma.<model>` instead of `this.txHost.tx.<model>` in a repository.
- A read that forgets `deletedAt: null`, or a repository method that accepts a Prisma `where`.
- An expected Prisma error (`P2002`, `P2025`) that bubbles up untranslated.
- `prisma db push` or `migrate dev` outside development, or an already applied migration that
  is modified.
- A controller that returns a domain model without `XxxResponseDto.fromDomain`.
- class-validator in `api/rest/` or in the config, a manual `@ApiProperty` on a Zod DTO, or a
  DTO field without `.describe()`.
- Reading `process.env` outside a Zod config file.
- A Command/Query without class-validator decorators.
- Returning `null` for a resource that is supposed to exist instead of throwing `NotFoundError`.
- An error code missing from `ERROR_CODES` or without a translation.
