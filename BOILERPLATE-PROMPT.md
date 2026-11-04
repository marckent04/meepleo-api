# Prompt — Recréer le boilerplate de l'API (NestJS + CQRS + Prisma + GraphQL + REST)

> Copie tout ce qui suit la ligne `---` dans un agent IA (Claude Code, etc.) à la racine d'un
> dossier vide. Remplace `<app-name>` par le nom du projet.

---

## Rôle et objectif

Tu es un développeur backend senior. Crée **from scratch** un boilerplate d'API **NestJS 12 /
TypeScript** nommé `<app-name>`, prêt pour la production, avec un cœur **CQRS strict**, une
persistance **Prisma** (PostgreSQL) et **deux transports fins** qui pilotent exactement les mêmes
commands/queries :

- **GraphQL** (code-first, Mercurius) ;
- **REST** (contrôleurs Nest, DTO **Zod**, documentation **OpenAPI/Swagger** générée depuis Zod).

Le boilerplate ne contient **aucune logique métier** spécifique, à part deux features de
démonstration qui servent de modèle à copier, exposées sur les deux transports :

1. **`user`** : inscription / connexion locale, refresh token avec rotation, logout, `me`.
2. **`project`** : CRUD complet d'une ressource appartenant à un utilisateur (sert de référence
   pour toute nouvelle feature).

Le code doit compiler (`yarn build`), passer le lint (`biome ci .`) et les tests (`yarn test`) à la
fin. Ne laisse ni TODO ni code mort. Avant d'écrire la couche Prisma, consulte la documentation
de la version de Prisma installée (générateur, `prisma.config.ts`, driver adapter) et suis-la si
elle diffère d'un détail de ce prompt.

## Principe directeur (non négociable)

> Les adaptateurs de transport ne contiennent **jamais** de logique métier. Ils traduisent une
> requête en Command/Query, la dispatchent sur le bus, puis traduisent le résultat en type de
> réponse. Tout ce qui décide *ce qui se passe* vit dans la couche domaine.

Sens des dépendances, à sens unique : `api` → `domain` → `infrastructure`. `shared` ne dépend de
personne et peut être importé partout. **Seul `infrastructure/database/` connaît Prisma** : aucun
type généré par Prisma (`@/infrastructure/database/generated/...`) n'est importé dans `domain/`,
`api/` ou `shared/`. `api/` n'importe **jamais** `infrastructure/database` (exception unique : la
`JwtStrategy` qui lit le `UserRepository`).

## Règle de validation : qui utilise quoi

| Zone | Outil | Interdit |
|---|---|---|
| Configuration (`shared/config/*`, `database.config.ts`, `prisma.config.ts`) | **Zod uniquement** | Joi, class-validator, lecture brute de `process.env` hors de ces fichiers |
| Couche REST (`api/rest/**`) : DTO de requête, params, query string, réponses, erreurs | **Zod uniquement** via `nestjs-zod` (`createZodDto`) ; la doc Swagger vient des schémas Zod (`.describe()`, `.meta()`) | class-validator, `@ApiProperty` écrits à la main sur un DTO Zod |
| Domaine (Commands / Queries) | class-validator (filet de sécurité indépendant du transport) | Zod |
| GraphQL (`@InputType`) | class-validator (requis par le code-first `@nestjs/graphql`) | Zod |

**Joi n'est pas installé.** Zod est la seule bibliothèque de schémas pour la config et le REST.

## Stack technique

| Domaine | Choix |
|---|---|
| Runtime | Node 24, Yarn (classic), TypeScript 5 (`target: esnext`, `module: commonjs`) |
| Framework | NestJS 12, **Fastify** (`@nestjs/platform-fastify`, `trustProxy: true`) |
| CQRS | `@nestjs/cqrs` (`Command<T>`, `Query<T>`, `CommandBus`, `QueryBus`) |
| BDD / ORM | PostgreSQL 17, **Prisma** (dernière version stable : `prisma` + `@prisma/client`, générateur `prisma-client`, driver adapter `@prisma/adapter-pg`, `prisma.config.ts`) |
| Transactions | `@nestjs-cls/transactional` + `@nestjs-cls/transactional-adapter-prisma` (transaction propagée par CLS, décorateur `@Transactional()`) |
| GraphQL | `@nestjs/graphql` + `@nestjs/mercurius` (code-first, `autoSchemaFile`, `sortSchema`) |
| REST | Contrôleurs Nest, versioning URI (`/v1/...`) |
| Schémas config + REST | **Zod 4** (`zod`) + **`nestjs-zod`** (`createZodDto`, `createZodValidationPipe`, `ZodSerializerInterceptor`, `cleanupOpenApiDoc`) |
| OpenAPI | `@nestjs/swagger` (+ `@fastify/static` pour servir l'UI sous Fastify), généré depuis les schémas Zod |
| Validation domaine / GraphQL | `class-validator` + `class-transformer` |
| Auth | `@nestjs/passport` + `passport-jwt`, `@nestjs/jwt`, hash **argon2** |
| Rate limit | `@nestjs/throttler` (60 req / 60 s), commun aux deux transports |
| Logs | `nestjs-pino` + `pino-pretty` (dev), `nestjs-cls` pour le correlation id |
| i18n | `nestjs-i18n` (`fr` par défaut, `en`), résolu depuis `Accept-Language` |
| DataLoader | `dataloader` (anti N+1 sur les `@ResolveField` GraphQL) |
| Tests | **Vitest** + `unplugin-swc` (métadonnées de décorateurs), `@vitest/coverage-v8` |
| Lint/format | **Biome** (2 espaces, `lineWidth: 80`, LF, simple quotes, pas de point-virgule) |
| Release | `semantic-release` (branche `main`, Conventional Commits) |
| Conteneur | Dockerfile multi-stage → `gcr.io/distroless/nodejs24-debian12` + stage `migrate` ; `compose.dev.yml` |

TypeORM n'est pas installé.

Alias TypeScript (`tsconfig.json`, `baseUrl: ./src`) : `@/*` → `src/*` et `@database` →
`src/infrastructure/database/index`. Les mêmes alias sont déclarés dans `vitest.config.ts`.

## Arborescence attendue

```
.
├── prisma/
│   ├── schema.prisma               modèles, enums, @@map / @map snake_case
│   ├── migrations/                 générées par `prisma migrate dev`, versionnées, relues à la main
│   └── seed.ts                     seed idempotent (upsert uniquement)
├── prisma.config.ts                schéma, dossier de migrations, commande de seed, URL (via la config Zod)
├── src/
│   ├── main.ts                     bootstrap (+ Swagger hors production)
│   ├── app.module.ts               compose uniquement Infrastructure + Domain + ApiCommon + GraphqlApi + RestApi
│   ├── api/
│   │   ├── common/                 TOUT ce qui est transverse aux deux transports
│   │   │   ├── api-common.module.ts    Passport, Throttler, JwtStrategy, guards/filtre/intercepteur globaux
│   │   │   ├── decorators/         Public, CurrentUser, CurrentSessionId, ClientIp, ClientUserAgent, ErrorCodeOnFailure
│   │   │   ├── guards/             JwtAuthGuard, AppThrottlerGuard (GraphQL + HTTP)
│   │   │   ├── strategies/         JwtStrategy
│   │   │   ├── filters/            AppExceptionFilter (aiguille GraphQL / HTTP)
│   │   │   ├── interceptors/       ErrorCodeOnFailureInterceptor
│   │   │   └── errors/             to-app-error.ts, error-translator.ts
│   │   ├── graphql/
│   │   │   ├── graphql.module.ts
│   │   │   ├── resolvers/          un resolver par feature + index.ts (barrel)
│   │   │   ├── inputs/             @InputType + class-validator, index.ts
│   │   │   ├── types/              @ObjectType + static fromDomain(), index.ts
│   │   │   ├── dataloaders/        DataLoaders Scope.REQUEST, index.ts
│   │   │   ├── pipes/              ClassValidatorPipe (ignore les DTO Zod)
│   │   │   ├── errors/             format-graphql-errors.ts (errorFormatter mercurius)
│   │   │   ├── logging/            describe-graphql-request.ts
│   │   │   └── scalars/            JSONScalar
│   │   └── rest/
│   │       ├── rest.module.ts
│   │       ├── controllers/        un contrôleur par feature + index.ts
│   │       ├── dto/                <feature>.dto.ts : schémas Zod + createZodDto + fromDomain, index.ts
│   │       ├── validation/         zod-validation.pipe.ts, zod-error-fields.ts
│   │       ├── errors/             error-response.dto.ts, format-rest-error.ts, api-error-responses.decorator.ts
│   │       └── swagger.ts          setupSwagger(app)
│   ├── domain/
│   │   ├── domain.module.ts
│   │   ├── index.ts                export * de chaque feature
│   │   └── <feature>/
│   │       ├── commands/           *.command.ts + index.ts
│   │       ├── queries/            *.query.ts + index.ts
│   │       ├── handlers/           *.handler.ts + *.handler.spec.ts + index.ts
│   │       ├── services/           (optionnel) logique partagée entre handlers
│   │       ├── types/              (optionnel) types composites locaux
│   │       └── index.ts
│   ├── infrastructure/
│   │   ├── infrastructure.module.ts   @Global (Config, CQRS, CLS + transactions, BDD, logger, i18n, adapters)
│   │   ├── index.ts
│   │   ├── database/
│   │   │   ├── database.module.ts      fournit et exporte PrismaService
│   │   │   ├── database.config.ts      config Zod (DATABASE_URL)
│   │   │   ├── prisma.service.ts       PrismaClient + driver adapter pg, cycle de vie Nest
│   │   │   ├── prisma-errors.ts        traduction des erreurs Prisma connues en AppError
│   │   │   ├── generated/              client Prisma généré (gitignoré, exclu de Biome)
│   │   │   ├── mappers/                <model>.mapper.ts : record Prisma → modèle de domaine + index.ts
│   │   │   ├── repositories/           *.repository.ts + index.ts
│   │   │   └── index.ts                repositories + PrismaService
│   │   ├── adapters/               intégrations externes (hors BDD) + adapters.module.ts
│   │   ├── logger/                 logger.module.ts, logger.service.ts, correlation-id.util.ts, redact.util.ts
│   │   └── i18n/                   i18n.module.ts + translations.spec.ts
│   ├── shared/
│   │   ├── config/                 parse-env.ts + un <name>.config.ts (schéma Zod + registerAs) par domaine
│   │   ├── decorators/             validateurs class-validator custom (domaine / GraphQL)
│   │   ├── errors/                 app-error.ts, error-codes.ts, cqrs-validation.exception.ts, validation-fields.ts
│   │   ├── i18n/locale.ts          SUPPORTED_LOCALES, DEFAULT_LOCALE, resolveLocale()
│   │   ├── types/                  modèles de domaine et enums métier (classes pures, sans Prisma)
│   │   └── index.ts
│   ├── utils/cqrs.utils.ts         AppCommandHandler / AppQueryHandler
│   ├── i18n/{fr,en}/{errors,validation}.json
│   ├── scripts/generate-schema.ts  génère src/schema.gql
│   └── __tests__/utils/            logger-service.mock.ts, prisma.mock.ts
├── vitest.config.ts / vitest.setup.ts
├── biome.json / tsconfig.json / tsconfig.build.json / nest-cli.json
├── Dockerfile / .dockerignore / compose.dev.yml / compose.prod.yml
├── .env.example / .releaserc.json / .gitignore
├── .github/workflows/{code_quality.yml,quality.yml,release.yml}
└── README.md / ARCHITECTURE.md
```

Convention de nommage des fichiers : `kebab-case.<rôle>.ts` (`create-project.command.ts`,
`project.repository.ts`, `project.mapper.ts`, `project.controller.ts`, `project.dto.ts`). Chaque
dossier qui contient plusieurs fichiers frères expose un `index.ts` barrel.

## 1. Bootstrap et modules

### `main.ts`
- `NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ trustProxy: true }), { bufferLogs: true, logger: new ConsoleLogger({ json: true, colors: false }) })`.
- `app.useLogger(app.get(PinoNestLogger))`.
- `useContainer(app.select(AppModule), { fallbackOnErrors: true })` (pour injecter des services
  dans les contraintes class-validator custom).
- `app.enableVersioning({ type: VersioningType.URI })` (routes REST en `/v1/...`).
- `enableCors()`, `enableShutdownHooks()` (déclenche le `$disconnect` de Prisma).
- Si `appConfig.nodeEnv !== 'production'` : `setupSwagger(app)` (UI sur `/docs`, JSON sur
  `/docs-json`) — même politique que GraphiQL/introspection.
- `listen(appConfig.port, '0.0.0.0')`.
- **L'application n'applique ni migrations ni seeds au démarrage** : c'est le rôle de
  `prisma migrate deploy` / `prisma db seed`, exécutés avant le déploiement (cf. §10).
- `bootstrap().catch(err => { bootstrapLogger.fatal(err, 'Bootstrap'); process.exit(1) })`.

### `AppModule`
`imports: [InfrastructureModule, DomainModule, ApiCommonModule, GraphqlApiModule, RestApiModule]` —
rien d'autre.

### `InfrastructureModule` (`@Global()`)
- `imports` :
  - `ConfigModule.forRoot({ isGlobal: true, load: [APP_CONFIG] })`, `CqrsModule.forRoot()` ;
  - `DatabaseModule` ;
  - `ClsModule.forRoot({ global: true, middleware: { mount: true, setup: (cls, req) => cls.set(CORRELATION_ID_KEY, resolveCorrelationId(req)) }, plugins: [new ClsPluginTransactional({ imports: [DatabaseModule], adapter: new TransactionalAdapterPrisma({ prismaInjectionToken: PrismaService }) })] })`
    — un seul `ClsModule`, partagé par le logger (correlation id) et les transactions ;
  - `AppLoggerModule`, `AppI18nModule`, `AdaptersModule`.
- `providers`: `...Object.values(repositories)`.
- `exports`: ces mêmes providers + `DatabaseModule` + `AdaptersModule` + `AppLoggerModule`.

### `DomainModule`
- `imports`: `CqrsModule` (sans `forRoot`), `InfrastructureModule`,
  `ConfigModule.forFeature(JWT_CONFIG)`, `JwtModule.registerAsync(...)` alimenté par la config JWT.
- `providers`: `...Object.values(<feature>Handlers)` pour chaque feature + les services de
  domaine. **Ajouter un handler = l'exporter depuis le barrel de sa feature**, aucune autre liste
  à maintenir.

### `ApiCommonModule` — socle commun aux transports
Les comportements transverses existent **une seule fois** et savent servir les deux contextes
(`context.getType<GqlContextType>()` vaut `'graphql'` ou `'http'`) :
- `imports`: `PassportModule`, `ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }])`,
  `ConfigModule.forFeature(JWT_CONFIG)`.
- `providers`: `JwtStrategy`, et en global : `APP_GUARD` → `JwtAuthGuard`, `APP_GUARD` →
  `AppThrottlerGuard`, `APP_FILTER` → `AppExceptionFilter`, `APP_INTERCEPTOR` →
  `ErrorCodeOnFailureInterceptor`.

### `GraphqlApiModule`
- `imports`: `CqrsModule`, `GraphQLModule.forRootAsync<MercuriusDriverConfig>` avec
  `MercuriusDriver` et une factory qui injecte `ConfigService`, `LoggerService`, `I18nService` :
  - `autoSchemaFile`: chemin `src/schema.gql` en production, `true` sinon ; `sortSchema: true` ;
  - `graphiql` et `introspection` désactivés en production ;
  - `context: (req, reply) => { logger.assign({ graphql: describeGraphqlRequest(req.body) }); return { req, reply } }` ;
  - `errorFormatter`: log des erreurs qui n'ont pas atteint le filtre, puis
    `createGraphqlErrorResponse(i18n)`.
- `providers`: `JSONScalar`, `...Object.values(resolvers)`, `...Object.values(dataloaders)`,
  `APP_PIPE` → `ClassValidatorPipe`.
- `ClassValidatorPipe extends ValidationPipe` (`forbidUnknownValues: true`,
  `exceptionFactory: errors => new BadRequestException(errors)`) et surcharge
  `toValidate(metadata)` pour retourner `false` quand `isZodDto(metadata.metatype)` (de
  `nestjs-zod`) : les pipes `APP_PIPE` sont globaux, chaque pipe doit donc ignorer les DTO de
  l'autre transport.

### `RestApiModule`
- `imports`: `CqrsModule`.
- `controllers`: `...Object.values(controllers)`.
- `providers`: `APP_PIPE` → `AppZodValidationPipe` (ignore nativement tout ce qui n'est pas un DTO
  Zod), `APP_INTERCEPTOR` → `ZodSerializerInterceptor` (valide/filtre les réponses décorées par
  `@ZodSerializerDto`).
- Aucun des deux modules de transport n'importe `DomainModule` : le bus est disponible grâce au
  module global.

## 2. Configuration — Zod uniquement

### `shared/config/parse-env.ts`
```ts
import { z } from 'zod'

/**
 * Valide process.env avec un schéma Zod. z.object() ignore les variables
 * inconnues ; toutes les erreurs sont rapportées en une fois.
 */
export function parseEnv<TSchema extends z.ZodType>(
  schema: TSchema,
  name: string,
  env: NodeJS.ProcessEnv = process.env,
): z.output<TSchema> {
  const result = schema.safeParse(env)
  if (!result.success) {
    throw new Error(
      `❌ ${name} environment validation error:\n${z.prettifyError(result.error)}`,
    )
  }
  return result.data
}
```

### Un fichier par domaine de config
Chaque `<name>.config.ts` exporte une clé, un schéma Zod des variables d'environnement, le type
de config (dérivé du schéma ou mappé explicitement) et un `registerAs` :

```ts
export const JWT_CONFIG_KEY = 'jwt'

const JwtEnvSchema = z.object({
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.coerce.number().int().positive(),
  REFRESH_TOKEN_EXPIRES_IN: z.coerce.number().int().positive(),
  REFRESH_TOKEN_GRACE_PERIOD: z.coerce.number().int().min(0).default(20),
})

export type JwtConfig = {
  secret: string
  expiresIn: number
  refreshTokenExpiresIn: number
  refreshTokenGracePeriod: number
}

export const JWT_CONFIG = registerAs(JWT_CONFIG_KEY, (): JwtConfig => {
  const env = parseEnv(JwtEnvSchema, 'JWT')
  return {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshTokenExpiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
    refreshTokenGracePeriod: env.REFRESH_TOKEN_GRACE_PERIOD,
  }
})
```

Consommé via `configService.getOrThrow<JwtConfig>(JWT_CONFIG_KEY)` ou
`@Inject(JWT_CONFIG.KEY) config: ConfigType<typeof JWT_CONFIG>`. Conventions Zod pour l'env :
nombres `z.coerce.number()`, booléens `z.stringbool()` (jamais `z.coerce.boolean()`, qui rend
`"false"` vrai), énumérations `z.enum([...])`, listes CSV
`z.string().default('').transform(csv).pipe(z.array(z.enum(LEVELS)))`.

Configs à créer :
- `app` : `NODE_ENV` (`z.enum(['development', 'test', 'production']).default('development')`),
  `PORT` (défaut 3000) ;
- `database` (dans `infrastructure/database/database.config.ts`) : `DATABASE_URL`
  (`z.url()` dont le protocole est `postgres:`/`postgresql:`), `DB_POOL_MAX`
  (`z.coerce.number().int().positive().default(10)`). Exporte aussi une fonction
  `loadDatabaseEnv()` réutilisée telle quelle par `prisma.config.ts` (qui ne relit donc pas
  `process.env` lui-même) ;
- `jwt` : cf. exemple ;
- `logger` : `LOG_LEVELS`, liste CSV de `trace|debug|info|warn|error|fatal`, sans doublon, défaut
  `warn,error`.

`.env.example` :

```dotenv
NODE_ENV=development
PORT=3000

# DATABASE (Prisma)
DATABASE_URL=postgresql://app:app@localhost:5432/app?schema=public
DB_POOL_MAX=10

# JWT
JWT_SECRET=
JWT_EXPIRES_IN=3600
REFRESH_TOKEN_EXPIRES_IN=604800
# Secondes pendant lesquelles l'ancien refresh token reste accepté après rotation (0 = désactivé)
REFRESH_TOKEN_GRACE_PERIOD=20

POSTGRES_PORT=5432
LOG_LEVELS=info,warn,error,fatal
```

## 3. Couche domaine — CQRS

### Commands
- Étendent `Command<TResult>` ; champs `readonly` décorés `class-validator` (`@IsUUID()`,
  `@IsString()`, `@IsOptional()`, décorateurs custom de `shared/decorators`).
- Constructeur à **objet de paramètres** typé `XxxParams` (dérivé par `Pick<>` des champs de la
  commande) appliqué avec `Object.assign`.

```ts
export class CreateProjectCommand extends Command<Project> {
  @IsOptional()
  @IsUUID('4')
  readonly id?: string

  @IsString()
  @IsNotEmpty()
  readonly name: string

  @IsUUID()
  readonly userId: string

  constructor({ ownerId, ...params }: CreateProjectParams) {
    super()
    Object.assign(this, { ...params, userId: ownerId })
  }
}

export type CreateProjectParams = Pick<CreateProjectCommand, 'id' | 'name'> & {
  ownerId: string
}
```

### Queries
Même forme, étendent `Query<TResult>`. Arguments positionnels autorisés quand il n'y a qu'un ou
deux champs (`new GetProjectQuery(id, userId)`).

### Classes de base des handlers — `src/utils/cqrs.utils.ts`
Écris `AppCommandHandler<TCommand extends Command<TResult>, TResult>` et
`AppQueryHandler<TQuery extends Query<TResult>, TResult>` :
- constructeur `(protected readonly logger: LoggerService, private readonly originType: 'user' | 'system', private readonly operationName: string)` ;
- `async execute(payload)` : appelle `validatePayload()` puis `this.handle(payload)` ;
- `abstract handle(payload): Promise<TResult>` ;
- `validatePayload` exécute `validate(data, { forbidUnknownValues: false })` ; en cas d'erreur,
  récupère les messages via `new ValidationPipe().createExceptionFactory()` et lève
  `CQRSValidationException({ data: structuredClone(data), operationName, originType, validationErrors, fields: toErrorFields(errors) })`.

### Handlers concrets
```ts
@CommandHandler(CreateProjectCommand)
export class CreateProjectHandler extends AppCommandHandler<CreateProjectCommand, Project> {
  constructor(
    private readonly projectRepository: ProjectRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', CreateProjectCommand.name)
    this.logger.setContext(CreateProjectHandler.name)
  }

  handle(command: CreateProjectCommand): Promise<Project> {
    return this.projectRepository.create(
      { id: command.id ?? randomUUID(), name: command.name },
      command.userId,
    )
  }
}
```

Règles :
- 1 handler = 1 command/query ; pas de switch sur un champ "type".
- Un handler retourne un **modèle de domaine** (`shared/types`), jamais un record Prisma, un type
  GraphQL ou un DTO REST.
- L'orchestration multi-entités se fait dans le handler (dans une transaction si besoin) ou le
  repository, jamais dans le resolver/contrôleur.
- `originType: 'system'` pour les opérations déclenchées par le serveur (cron, sync) : une erreur
  de validation y devient une 500, pas une 400.

### Modèles de domaine — `shared/types/`
Classes pures, sans aucune dépendance à Prisma, constructeur à paramètres `readonly`. Les enums
métier (`AuthProvider`…) sont déclarés ici avec les mêmes valeurs que les enums Prisma ; la
correspondance est faite par les mappers (§4), jamais en important l'enum généré.

### Transactions
Le domaine ne voit jamais de client Prisma. Un handler qui doit regrouper plusieurs écritures
pose `@Transactional()` (de `@nestjs-cls/transactional`) sur sa méthode `handle` : la
transaction Prisma est ouverte et propagée par CLS, et tous les repositories appelés dedans
l'utilisent automatiquement. Aucun paramètre `tx`/`manager` ne circule dans les signatures.

```ts
@Transactional()
async handle(command: DeleteProjectCommand): Promise<void> {
  await this.taskRepository.detachFromProject(command.id, command.userId)
  await this.projectRepository.softDelete(command.id, command.userId)
}
```

Hors requête HTTP (script, cron), ouvrir un contexte avec `cls.run(() => ...)` avant d'appeler un
handler transactionnel.

## 4. Couche infrastructure — persistance Prisma

### `prisma/schema.prisma`
```prisma
generator client {
  provider     = "prisma-client"
  output       = "../src/infrastructure/database/generated/prisma"
  moduleFormat = "cjs"
}

datasource db {
  provider = "postgresql"
}
```
(l'URL vient de `prisma.config.ts`, cf. plus bas).

Conventions de modélisation :
- Modèles en `PascalCase` singulier, tables en `snake_case` pluriel via `@@map("projects")` ;
  champs en `camelCase`, colonnes en `snake_case` via `@map("owner_id")`.
- Ids `String @id @db.Uuid` : `@default(uuid())` sauf quand l'id peut venir du client
  (offline-first), auquel cas pas de `@default` et le handler fournit `randomUUID()`.
- Dates `DateTime @db.Timestamptz(6)` : `createdAt @default(now())`, `updatedAt @updatedAt`,
  `deletedAt DateTime?` pour le soft delete.
- Clé étrangère explicite (`ownerId String @map("owner_id") @db.Uuid`) + relation
  (`owner User @relation(fields: [ownerId], references: [id])`), `@@index([ownerId])`.

Modèles à créer : `User` (id, email `@unique`, createdAt, updatedAt, relations `authMethods`,
`sessions`, `projects`), `AuthMethod` (enum `AuthProvider { LOCAL }`, `providerId` = hash argon2
pour LOCAL, `userId`, `@@unique([provider, userId])`), `UserSession` (refreshTokenHash,
previousRefreshTokenHash?, rotatedAt?, expiresAt, ipAddress?, userAgent?, userId,
`onDelete: Cascade`), `Project` (id, name, isActive `@default(true)`, ownerId/owner, createdAt,
updatedAt, deletedAt?).

### `prisma.config.ts`
`defineConfig` (de `prisma/config`) avec `schema: 'prisma/schema.prisma'`,
`migrations: { path: 'prisma/migrations', seed: 'ts-node -r tsconfig-paths/register prisma/seed.ts' }`
et `datasource: { url: loadDatabaseEnv().DATABASE_URL }` (validation Zod partagée avec l'app).

### `PrismaService` (`database/prisma.service.ts`)
```ts
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(@Inject(DATABASE_CONFIG.KEY) config: ConfigType<typeof DATABASE_CONFIG>) {
    super({
      adapter: new PrismaPg({ connectionString: config.url, max: config.poolMax }),
    })
  }

  async onModuleInit(): Promise<void> {
    await this.$connect()
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
```
`DatabaseModule` : `imports: [ConfigModule.forFeature(DATABASE_CONFIG)]`,
`providers/exports: [PrismaService]`. Le client est importé depuis le dossier `generated/`, pas
depuis `@prisma/client`.

### Mappers (`database/mappers/`)
Le **seul** endroit qui convertit un record Prisma en modèle de domaine :

```ts
import type { Project as ProjectRecord } from '../generated/prisma/client'

export function toProject(record: ProjectRecord): Project {
  return new Project(
    record.id,
    record.name,
    record.isActive,
    record.createdAt,
    record.updatedAt,
    record.deletedAt,
  )
}
```
Les types générés sont toujours aliasés `XxxRecord` pour ne jamais être confondus avec le modèle
de domaine du même nom. C'est ce qui rend la persistance remplaçable : changer d'ORM ne touche que
`infrastructure/database/`.

### Repositories (`database/repositories/`)
- Un par agrégat, `@Injectable()`, injectent
  `TransactionHost<TransactionalAdapterPrisma<PrismaService>>` et `LoggerService` (+ `setContext`).
  Ils passent **toujours** par `this.txHost.tx.<model>` : hors transaction c'est le client
  normal, dans un handler `@Transactional()` c'est le client de la transaction.
- Méthodes au nom explicite et à signature étroite : `findByIdAndUserId`, `existsByIdAndUserId`,
  `findByIds`, `findAllByOwner`, `create`, `update`, `softDelete`. **Pas** de méthode générique
  qui accepte un `where`/`Prisma.XxxWhereInput` fourni par l'appelant.
- `select`/`include` explicites quand on n'a pas besoin de toutes les colonnes ou qu'on charge une
  relation.
- Le soft delete est filtré explicitement : chaque lecture ajoute `deletedAt: null` (constante
  `NOT_DELETED` partagée par les repositories).
- Retournent des **modèles de domaine** via les mappers, jamais un record.
- Une recherche censée exister qui échoue lève
  `new NotFoundError('Project not found', { code: ErrorCode.PROJECT_NOT_FOUND })` ; une recherche
  batch (`findByIds`) retourne `[]`.
- Toute écriture susceptible d'échouer sur une contrainte est enveloppée par
  `rethrowPrismaError` (cf. ci-dessous).

```ts
@Injectable()
export class ProjectRepository {
  constructor(
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma<PrismaService>>,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(ProjectRepository.name)
  }

  async create(data: { id: string; name: string }, ownerId: string): Promise<Project> {
    const record = await this.txHost.tx.project.create({
      data: { ...data, ownerId },
    })
    return toProject(record)
  }

  async findByIdAndUserId(id: string, userId: string): Promise<Project> {
    const record = await this.txHost.tx.project.findFirst({
      where: { id, ownerId: userId, ...NOT_DELETED },
    })
    if (!record) {
      throw new NotFoundError('Project not found', { code: ErrorCode.PROJECT_NOT_FOUND })
    }
    return toProject(record)
  }

  async findByIds(ids: string[]): Promise<Project[]> {
    if (ids.length === 0) return []
    const records = await this.txHost.tx.project.findMany({
      where: { id: { in: ids }, ...NOT_DELETED },
    })
    return records.map(toProject)
  }
}
```

### Erreurs Prisma (`database/prisma-errors.ts`)
`rethrowPrismaError(error, codes: { notFound?: ErrorCode; conflict?: ErrorCode }): never` :
`PrismaClientKnownRequestError` `P2002` (unicité) → `ConflictError` avec `codes.conflict`
(`details.target` = champs en conflit), `P2025` (enregistrement introuvable) → `NotFoundError`
avec `codes.notFound`, `P2003` (clé étrangère) → `BadRequestError` ; tout le reste est relancé
tel quel (et deviendra une `InternalError` dans le filtre). Exemple : l'inscription mappe `P2002`
sur `USER_EXISTS`. La couche `api/` ne connaît donc jamais les codes Prisma.

### Migrations et seed
- Développement : `yarn db:migrate --name <change>` (`prisma migrate dev`) génère le SQL dans
  `prisma/migrations/<timestamp>_<change>/migration.sql` ; le SQL est **relu et versionné**.
- Production : `yarn db:deploy` (`prisma migrate deploy`) dans l'étape `migrate` de l'image
  (§10), avant le démarrage de la nouvelle version. Jamais `migrate dev` ni `db push` en prod.
- Génère une migration initiale `init` correspondant aux modèles.
- `prisma/seed.ts` : uniquement des `upsert` (rejouable à volonté), exécuté par `yarn db:seed` et
  après `migrate deploy` dans l'étape `migrate`.

### Adapters (`infrastructure/adapters/`)
Dossier réservé aux intégrations externes **hors BDD** (API tierces, SDK IA…). Chaque
intégration a son sous-dossier, ses schémas de requête/réponse (Zod), sa config Zod via
`ConfigModule.forFeature(...)` dans `adapters.module.ts`. Un adapter ne connaît pas la BDD ; un
repository ne connaît pas les adapters. Les handlers les injectent comme des repositories.
Dans le boilerplate, crée `adapters.module.ts` vide (providers/exports `[]`) prêt à l'emploi.

### Logger (`infrastructure/logger/`)
- `AppLoggerModule` : `PinoLoggerModule.forRootAsync` avec : filtrage par l'ensemble exact des
  niveaux de `LOG_LEVELS` (hook `logMethod`), `autoLogging: false`, `messageKey: 'message'`,
  niveaux mappés en `severity` Cloud Logging (`DEBUG/INFO/WARNING/ERROR/CRITICAL`),
  `genReqId: resolveCorrelationId`, `customAttributeKeys: { reqId: 'correlationId' }`,
  redaction de `req.headers.authorization` et `req.headers.cookie`, sérialiseurs
  `stdSerializers.errWithCause`, transport `pino-pretty` mono-ligne hors production. Le
  `ClsModule` est celui de `InfrastructureModule`.
- `resolveCorrelationId(req)` : réutilise `x-correlation-id` / `x-request-id` sinon
  `crypto.randomUUID()`, mémoïsé sur la requête via un `Symbol`.
- `LoggerService` (`Scope.TRANSIENT`) : enveloppe `PinoLogger` + `ClsService`, méthodes
  `trace/debug/info/warn/error/fatal`, `setContext(name)`, `assign(fields)` (liés à tous les logs
  suivants de la requête). Il fusionne `correlationId` + champs assignés à chaque log, transforme
  une `Error` passée en premier argument en `{ err }`, et logue sans bindings hors requête.
- `redactSecrets(obj)` : masque récursivement les clés sensibles (`password`, `token`,
  `refreshToken`, `secret`, `authorization`…) avant de logger des `details`.
- En développement, logue en `debug` les requêtes Prisma lentes via `$on('query')` (durée >
  seuil), jamais leurs paramètres.

### i18n (`infrastructure/i18n/`)
- `AppI18nModule` : `I18nModule.forRoot({ fallbackLanguage: DEFAULT_LOCALE, loaderOptions: { path: path.join(__dirname, '../../i18n'), watch: NODE_ENV === 'development' }, resolvers: [AcceptLanguageResolver] })`.
- `src/i18n/<lang>/errors.json` (clé = code d'erreur) et `validation.json` qui contient :
  les contraintes class-validator à la racine (`isEmail`, `isNotEmpty`…, + `default`) et un objet
  `zod` indexé par code d'issue Zod 4 (`invalid_type`, `too_small`, `too_big`,
  `invalid_format`, `invalid_value`, `not_multiple_of`, `unrecognized_keys`, `invalid_union`,
  `invalid_key`, `invalid_element`, `custom`). `nest-cli.json` copie `i18n/**/*.json` dans `dist`.
- `shared/i18n/locale.ts` : `SUPPORTED_LOCALES = ['fr', 'en'] as const`, `DEFAULT_LOCALE = 'fr'`,
  `resolveLocale(acceptLanguage)` qui parse les q-values, ignore les régions, retombe sur le
  défaut.
- `translations.spec.ts` : échoue si une clé de `ERROR_CODES` manque dans une langue, si un
  fichier contient une clé inconnue, si un code d'issue Zod n'est pas traduit, ou si les langues
  n'ont pas les mêmes clés de validation.

## 5. Gestion des erreurs (commune aux deux transports)

### `shared/errors/app-error.ts`
`abstract class AppError extends Error` avec `abstract statusCode`, `code`, `details?` (loggé
seulement), `params?` (interpolation i18n), `fields?: { field, constraint }[]`, extensions
publiques, getter `extensions` (`{ ...public, code }`) et getter `expected` (`statusCode < 500`).
Sous-classes : `BadRequestError` (400, `BAD_REQUEST`), `UnauthenticatedError` (401),
`ForbiddenError` (403), `NotFoundError` (404), `ConflictError` (409),
`BusinessRuleError(code, message)` (422), `TooManyRequestsError` (429), `InternalError` (500,
message neutre par défaut). Le premier argument (message) n'est **que** loggé.

### `shared/errors/error-codes.ts`
`enum ErrorCode` + `ERROR_CODES: Record<ErrorCode, { expected: boolean; description: string }>`
+ `isErrorCode(code)`. C'est l'inventaire contractuel : on ajoute un code, on n'en renomme ni n'en
supprime jamais. Codes du boilerplate : `BAD_REQUEST, UNAUTHENTICATED, FORBIDDEN, NOT_FOUND,
CONFLICT, TOO_MANY_REQUESTS, VALIDATION_FAILED, INTERNAL_SERVER_ERROR, GRAPHQL_INVALID_QUERY,
INVALID_CREDENTIALS, USER_EXISTS, USER_NOT_FOUND, PROJECT_NOT_FOUND`.

### `CQRSValidationException extends AppError`
Origine `user` → 400 `VALIDATION_FAILED` avec `extensions.validationErrors` et `fields` ;
origine `system` → 500 `INTERNAL_SERVER_ERROR` sans exposer les détails. `details` contient
`operationName`, `originType`, `data`.

### Champs invalides
- `toErrorFields(errors, parentPath?)` (`shared/errors/validation-fields.ts`) : aplatit les
  `ValidationError` class-validator en `{ field: 'a.0.b', constraint: 'isEmail' }[]`.
- `toZodErrorFields(error: ZodError)` (`api/rest/validation/zod-error-fields.ts`) :
  `error.issues.map(issue => ({ field: issue.path.join('.'), constraint: \`zod.${issue.code}\` }))`.
Les deux produisent le même `ErrorField`, donc la traduction et le format client sont identiques
quelle que soit la bibliothèque qui a validé.

### Socle commun (`api/common/`)
1. **`toAppError(exception)`** : `AppError` tel quel ; `HttpException` mappée par statut (un
   `BadRequestException` contenant des `ValidationError` class-validator devient
   `VALIDATION_FAILED` avec `fields`) ; tout le reste (y compris une erreur Prisma non traduite
   par un repository) → `InternalError` avec `cause`.
2. **`errorTranslator(i18n, lang)`** : `{ error(code, params), constraint(name) }` avec repli sur
   `validation.default` ; code non catalogué → code générique du statut (400/401/403/404/409/422/429),
   pour qu'un client ne reçoive jamais un message non traduit.
3. **`AppExceptionFilter`** (`@Catch()`, global) : seul endroit qui **logue** une erreur levée
   pendant une requête. Erreur attendue → `warn` une ligne sans stack ; sinon `error` avec stack
   et causes, `details` passés par `redactSecrets`, et message masqué (`InternalError`) en
   production. Puis il aiguille selon `host.getType<GqlContextType>()` :
   - `'graphql'` : logue `operation: Parent.field` + `path` et **retourne** l'`AppError`
     (graphql-js la localise, l'`errorFormatter` la traduit) ;
   - `'http'` : construit le corps avec `formatRestError(error, translator)` (langue via
     `resolveLocale(request.headers['accept-language'])`) et répond
     `reply.status(error.statusCode).send(body)` sur la `FastifyReply`.
4. **`@ErrorCodeOnFailure(code)`** + **`ErrorCodeOnFailureInterceptor`** : remplace le
   `INTERNAL_SERVER_ERROR` générique par le code de l'action ; laisse intacts les codes
   spécifiques et les erreurs client. Fonctionne pour un resolver comme pour une route.

### Spécifique GraphQL
- **`createGraphqlErrorResponse(i18n)`** (errorFormatter mercurius) : HTTP **toujours 200** ;
  pour chaque erreur, `message` traduit, `extensions.code`, `extensions.fields: { field, message }[]`.
  Erreur sans `path` (document invalide) → `GRAPHQL_INVALID_QUERY`. Aplatit les erreurs de
  validation imbriquées de mercurius (`MER_ERR_GQL_VALIDATION`).
- **`ErrorResolver`** : query publique `errorCodes: [ErrorCode!]!`
  (`registerEnumType(ErrorCode, { name: 'ErrorCode' })`).

### Spécifique REST
- Le **vrai statut HTTP** = `error.statusCode` (400, 401, 404, 409, 422, 429, 500).
- Corps (`formatRestError`) conforme à `ErrorResponseSchema` :

```ts
export const ErrorResponseSchema = z
  .object({
    code: z.enum(ErrorCode).describe('Code stable sur lequel le client branche sa logique'),
    message: z.string().describe("Message traduit selon Accept-Language, affichable tel quel"),
    fields: z
      .array(z.object({ field: z.string(), message: z.string() }))
      .optional()
      .describe('Champs invalides (VALIDATION_FAILED uniquement)'),
    correlationId: z.string().describe('À communiquer au support'),
  })
  .meta({ id: 'ErrorResponse' })

export class ErrorResponseDto extends createZodDto(ErrorResponseSchema) {}
```

- `@ApiErrorResponses(...statuses)` (`api/rest/errors/api-error-responses.decorator.ts`) :
  `applyDecorators` de `@ApiResponse({ status, type: ErrorResponseDto })` pour chaque statut, afin
  que chaque route documente ses erreurs dans Swagger. L'énumération `ErrorCode` apparaît ainsi
  typée dans l'OpenAPI (équivalent REST de la query `errorCodes`).

Recette pour ajouter une erreur : code dans `ERROR_CODES` → message dans `fr/errors.json` et
`en/errors.json` → `throw new NotFoundError('…', { code: ErrorCode.X })`. Rien à toucher côté
transport.

## 6. Auth (commune aux deux transports)

- `JwtStrategy` (`passport-jwt`, Bearer, `ignoreExpiration: false`) : payload
  `{ sub, email, sid }`, vérifie que l'utilisateur existe, retourne
  `AuthenticatedUser = { id, email, sessionId }`.
- `JwtAuthGuard extends AuthGuard('jwt')` (global) : `getRequest(context)` renvoie
  `GqlExecutionContext.create(context).getContext().req` en GraphQL, sinon
  `context.switchToHttp().getRequest()` ; laisse passer si la métadonnée `isPublic` est posée.
- `AppThrottlerGuard extends ThrottlerGuard` : `getRequestResponse` renvoie `{ req, res: reply }`
  depuis le contexte GraphQL, sinon depuis `switchToHttp()`.
- `@Public()` = `SetMetadata('isPublic', true)`.
- `@CurrentUser()`, `@CurrentSessionId()`, `@ClientIp()`, `@ClientUserAgent()` : décorateurs de
  paramètre qui résolvent la requête de la même façon (GraphQL ou HTTP).

### Feature `user` à implémenter
- `AuthService` (domaine) : `registerLocal` (email existant → `ConflictError USER_EXISTS`, via
  `P2002` traduit par le repository ; création `User` + `AuthMethod` dans une même transaction ;
  hash argon2), `loginLocal` (`argon2.verify` → sinon `UnauthenticatedError INVALID_CREDENTIALS`),
  génération access token JWT (`sub`, `email`, `sid`) + refresh token opaque aléatoire dont seul
  le hash est stocké dans `user_sessions`.
- Rotation du refresh token : à chaque refresh, l'ancien hash passe dans
  `previousRefreshTokenHash` + `rotatedAt` ; l'ancien token reste accepté
  `REFRESH_TOKEN_GRACE_PERIOD` secondes (requêtes concurrentes), au-delà → `UNAUTHENTICATED`. La
  mise à jour de la session est conditionnelle (`updateMany` sur le hash attendu) pour qu'un
  refresh concurrent ne puisse pas écraser une rotation déjà faite.
- Commands : `UserRegisterCommand`, `UserLoginCommand`, `UserRefreshTokenCommand`,
  `UserLogoutCommand` (session courante), `UserLogoutAllCommand`. Query : `GetCurrentUserQuery`.

### Feature `project` à implémenter
Commands `CreateProjectCommand`, `UpdateProjectCommand(id, userId, params)`,
`DeleteProjectCommand(id, userId)` (soft delete) ; queries `GetProjectQuery(id, userId)`,
`GetProjectsQuery(userId, search?)` (`name: { contains: search, mode: 'insensitive' }`),
`GetProjectsByIdsQuery(ids)` (pour le DataLoader). Toutes les lectures/écritures sont scopées par
`userId` (un projet d'un autre utilisateur = `PROJECT_NOT_FOUND`).

## 7. Couche API — GraphQL

### Resolvers
- Injectent `CommandBus` / `QueryBus` (et des DataLoaders) — **jamais** un repository ni un
  handler.
- Une méthode par opération ; construisent la Command/Query depuis l'input validé +
  `@CurrentUser()`, dispatchent, puis mappent avec `XxxType.fromDomain(model)`.

```ts
@Mutation(() => ProjectType)
async createProject(
  @Args('input') input: CreateProjectInput,
  @CurrentUser() user: AuthenticatedUser,
): Promise<ProjectType> {
  const project = await this.commandBus.execute(
    new CreateProjectCommand({ id: input.id, name: input.name, ownerId: user.id }),
  )
  return ProjectType.fromDomain(project)
}
```

### Inputs / Types
- `@InputType()` avec `@Field()` **et** décorateurs `class-validator` (double validation
  volontaire : pipe + Command). Objets imbriqués : `@ValidateNested({ each: true })` +
  `@Type(() => X)`.
- `@ObjectType('Project')` avec `static fromDomain(model)`. Les relations sont résolues
  paresseusement via `@ResolveField` + DataLoader.

### DataLoaders
`@Injectable({ scope: Scope.REQUEST })`, une instance `new DataLoader<string, T>(async ids => ...)`
qui dispatche **une seule** `GetXxxByIdsQuery` puis réordonne via une `Map` (`ids.map(id => map.get(id) ?? null)`).

### Opérations
- `AuthResolver` : mutations `register`, `localLogin`, `refreshToken` (`@Public()`, retournent
  `AuthTokens { accessToken, refreshToken }`), `logout`, `logoutAll` (→ `Boolean`), query `me`.
- `ProjectResolver` : `projects(filter)`, `project(id)`, `createProject`, `updateProject`,
  `deleteProject`.

### Script de schéma
`src/scripts/generate-schema.ts` : `NestFactory.createApplicationContext(GraphQLSchemaBuilderModule)`
+ `GraphQLSchemaFactory.create(Object.values(resolvers), [JSONScalar])` → écrit `src/schema.gql`
(utilisé par le build Docker, la prod lit ce fichier).

## 8. Couche API — REST (Zod + Swagger)

### Contrôleurs
Mêmes règles que les resolvers : injectent `CommandBus` / `QueryBus` uniquement, une méthode par
route, construisent la Command/Query depuis le DTO validé + `@CurrentUser()`, dispatchent, puis
mappent avec `XxxResponseDto.fromDomain(model)`. Ils ne retournent **jamais** un modèle de
domaine brut.

```ts
@ApiTags('projects')
@ApiBearerAuth()
@Controller({ path: 'projects', version: '1' })
export class ProjectController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Créer un projet' })
  @ApiCreatedResponse({ type: ProjectResponseDto })
  @ApiErrorResponses(400, 401, 429)
  @ZodSerializerDto(ProjectResponseDto)
  async create(
    @Body() body: CreateProjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProjectResponseDto> {
    const project = await this.commandBus.execute(
      new CreateProjectCommand({ id: body.id, name: body.name, ownerId: user.id }),
    )
    return ProjectResponseDto.fromDomain(project)
  }

  @Get(':id')
  @ApiOkResponse({ type: ProjectResponseDto })
  @ApiErrorResponses(400, 401, 404)
  @ZodSerializerDto(ProjectResponseDto)
  async findOne(
    @Param() params: ProjectIdParamsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProjectResponseDto> {
    const project = await this.queryBus.execute(new GetProjectQuery(params.id, user.id))
    return ProjectResponseDto.fromDomain(project)
  }
}
```

Si la version installée de `nestjs-zod` fournit `@ZodResponse({ type, status })` (qui documente
**et** sérialise en un seul décorateur), utilise-le à la place du couple
`@ApiOkResponse` + `@ZodSerializerDto`.

### DTO — un fichier `dto/<feature>.dto.ts` par feature
- Le **schéma Zod est la source unique** de la validation, du type TypeScript et de la doc
  Swagger. Chaque champ porte `.describe('…')` ; exemples et identifiants de composant via
  `.meta({ example, id })`. Aucun `@ApiProperty` manuel.
- Requêtes : `class XxxDto extends createZodDto(XxxSchema) {}` pour `@Body()`, `@Param()` et
  `@Query()` (query string : `z.coerce.number()` / `z.stringbool()` pour les scalaires).
  `z.strictObject` côté body pour refuser les champs inconnus.
- Réponses : schéma Zod de sortie (dates en `z.iso.datetime()`, jamais d'objet `Date`) + classe
  avec `static fromDomain(model)` qui est le seul mapping modèle → JSON.
- Les DTO ne réutilisent **jamais** les types générés par Prisma : ils décrivent le contrat
  public, pas la table.

```ts
export const CreateProjectSchema = z.strictObject({
  id: z.uuid().optional().describe('Identifiant généré côté client (UUID v4), optionnel'),
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe('Nom du projet')
    .meta({ example: 'Lancement v2' }),
})
export class CreateProjectDto extends createZodDto(CreateProjectSchema) {}

export const UpdateProjectSchema = CreateProjectSchema.omit({ id: true }).partial()
export class UpdateProjectDto extends createZodDto(UpdateProjectSchema) {}

export const ProjectIdParamsSchema = z.object({
  id: z.uuid().describe('Identifiant du projet'),
})
export class ProjectIdParamsDto extends createZodDto(ProjectIdParamsSchema) {}

export const ListProjectsQuerySchema = z.object({
  search: z.string().trim().min(1).optional().describe('Filtre sur le nom (insensible à la casse)'),
})
export class ListProjectsQueryDto extends createZodDto(ListProjectsQuerySchema) {}

export const ProjectResponseSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    isActive: z.boolean(),
    createdAt: z.iso.datetime().describe('Date de création (ISO 8601, UTC)'),
    updatedAt: z.iso.datetime().describe('Dernière modification (ISO 8601, UTC)'),
  })
  .meta({ id: 'Project', description: "Un projet de l'utilisateur" })

export class ProjectResponseDto extends createZodDto(ProjectResponseSchema) {
  static fromDomain(project: Project): ProjectResponseDto {
    return {
      id: project.id,
      name: project.name,
      isActive: project.isActive,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    }
  }
}
```

### Pipe de validation — `validation/zod-validation.pipe.ts`
```ts
export const AppZodValidationPipe = createZodValidationPipe({
  createValidationException: (error: ZodError) =>
    new BadRequestError('Validation failed', {
      code: ErrorCode.VALIDATION_FAILED,
      fields: toZodErrorFields(error),
    }),
})
```
Une erreur Zod devient donc directement une `AppError` : même code, même format `fields` traduit
que côté GraphQL.

### Routes du boilerplate
| Méthode | Route | Public | Réponse |
|---|---|---|---|
| POST | `/v1/auth/register` | oui | 201 `AuthTokensResponseDto` |
| POST | `/v1/auth/login` | oui | 200 `AuthTokensResponseDto` |
| POST | `/v1/auth/refresh` | oui | 200 `AuthTokensResponseDto` |
| POST | `/v1/auth/logout` | non | 204 |
| POST | `/v1/auth/logout-all` | non | 204 |
| GET | `/v1/me` | non | 200 `CurrentUserResponseDto` |
| GET | `/v1/projects?search=` | non | 200 `ProjectResponseDto[]` |
| GET | `/v1/projects/:id` | non | 200 `ProjectResponseDto` |
| POST | `/v1/projects` | non | 201 `ProjectResponseDto` |
| PATCH | `/v1/projects/:id` | non | 200 `ProjectResponseDto` |
| DELETE | `/v1/projects/:id` | non | 204 |

### Swagger — `rest/swagger.ts`
```ts
export function setupSwagger(app: NestFastifyApplication): void {
  const config = new DocumentBuilder()
    .setTitle('<app-name> API')
    .setVersion(process.env.npm_package_version ?? '0.0.0')
    .addBearerAuth()
    .build()
  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('docs', app, cleanupOpenApiDoc(document))
}
```
`cleanupOpenApiDoc` (nestjs-zod) convertit les schémas Zod en composants OpenAPI propres
(descriptions, exemples, `id` de `.meta()`). La doc n'est servie que hors production.

## 9. Tests

- `vitest.config.ts` : plugin `swc.vite({ module: { type: 'es6' } })`, `oxc: false`,
  `resolve.tsconfigPaths: true` + alias `@`, `globals: true`, `environment: 'node'`,
  `include: ['src/**/*.spec.ts']`, coverage v8 (`text`, `lcov`, `json-summary`) en excluant
  `src/infrastructure/database/generated/**`, `setupFiles: ['./vitest.setup.ts']`.
- `vitest.setup.ts` : `import 'reflect-metadata'` + mock de `nestjs-pino`
  (`InjectPinoLogger` no-op, `PinoLogger` classe vide).
- `src/__tests__/utils/logger-service.mock.ts` : `mockLoggerService` avec toutes les méthodes en
  `vi.fn()`.
- `src/__tests__/utils/prisma.mock.ts` : fabrique d'un faux `TransactionHost` dont `tx` expose
  les délégués de modèles (`project.findFirst`, `project.create`…) en `vi.fn()`, pour tester les
  repositories sans base.
- Spec colocalisé `*.spec.ts` pour **chaque** handler : `Test.createTestingModule` avec le handler
  réel, le repository mocké (`{ provide: ProjectRepository, useValue: { create: vi.fn() } }`) et
  `{ provide: LoggerService, useValue: mockLoggerService }` ; on appelle `handler.handle()`
  directement et on vérifie les arguments du repository et le modèle retourné ;
  `vi.clearAllMocks()` en `afterEach`. Le décorateur `@Transactional()` est neutralisé dans les
  tests unitaires (mock de `@nestjs-cls/transactional` dans `vitest.setup.ts`).
- Tests à fournir en plus :
  - config : `parse-env.spec.ts` + un spec par config (valeurs par défaut, coercition,
    `DATABASE_URL` invalide refusée, message d'erreur listant toutes les variables invalides) ;
  - persistance : `prisma-errors.spec.ts` (P2002 → Conflict, P2025 → NotFound, P2003 →
    BadRequest, autre → relancée), un spec par mapper, `project.repository.spec.ts` (filtre
    `deletedAt: null`, scope `ownerId`, `NotFoundError`, `findByIds([])` sans requête) ;
  - `cqrs.utils.spec.ts` (validation user → 400 / system → 500) ;
  - `app-exception.filter.spec.ts` (branche GraphQL et branche HTTP, masquage en production),
    `error-code-on-failure.interceptor.spec.ts`, `format-graphql-errors.spec.ts`,
    `format-rest-error.spec.ts`, `zod-error-fields.spec.ts` ;
  - `project.dto.spec.ts` (schémas Zod : cas valides/invalides, `fromDomain`) ;
  - `rest-errors.integration.spec.ts` : application Nest Fastify de test (`app.inject`, repositories
    mockés) qui vérifie un 400 `VALIDATION_FAILED` avec `fields` traduits, un 404
    `PROJECT_NOT_FOUND` en français puis en anglais (`Accept-Language: en`), un 401 sans Bearer ;
  - `ClassValidatorPipe` ignore un DTO Zod et `AppZodValidationPipe` ignore un `@InputType` ;
  - `locale.spec.ts`, `translations.spec.ts`, `auth.service.spec.ts` (rotation + période de grâce,
    refresh concurrent).

## 10. Outillage

### `package.json` — scripts
```json
{
  "postinstall": "prisma generate",
  "build": "prisma generate && nest build",
  "start": "nest start",
  "start:dev": "nest start --watch",
  "start:debug": "nest start --debug --watch",
  "start:prod": "node dist/main",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:cov": "vitest run --coverage",
  "format": "biome format --write",
  "lint": "biome lint --write",
  "lint-and-format": "biome check --write",
  "generate-schema": "ts-node --require tsconfig-paths/register src/scripts/generate-schema.ts",
  "db:generate": "prisma generate",
  "db:migrate": "prisma migrate dev",
  "db:deploy": "prisma migrate deploy",
  "db:seed": "prisma db seed",
  "db:reset": "prisma migrate reset",
  "db:studio": "prisma studio",
  "db:validate": "prisma validate && prisma format --check",
  "semantic-release": "semantic-release"
}
```

### `tsconfig.json`
`module: commonjs`, `target: esnext`, `lib: ["ES2023"]`, `emitDecoratorMetadata`,
`experimentalDecorators`, `strict: true` (exigé par l'inférence de types Zod et Prisma),
`moduleResolution: node`, `esModuleInterop`, `resolveJsonModule`, `skipLibCheck`,
`incremental`, `outDir: ./dist`, `baseUrl: ./src`, `paths` (cf. plus haut),
`types: ["node", "vitest/globals"]`, `include` : `src/**/*` et `prisma/seed.ts`.

### `biome.json`
`vcs.useIgnoreFile: true`, `files.includes: ["src/**", "prisma/**/*.ts", "!src/infrastructure/database/generated"]`,
formatter (espaces, 2, LF, 80), JavaScript : `quoteStyle: single`, `semicolons: asNeeded`,
`trailingCommas: all`, `arrowParentheses: always`. Linter en `preset: none` avec un jeu explicite
de règles `correctness` (`noUnusedVariables`, `noUnreachable`…), `style` (`noCommonJs`,
`noNamespace`, `useConsistentMemberAccessibility: noPublic`…), `suspicious` (`noDebugger`…), et
`unsafeParameterDecoratorsEnabled: true` pour le parser. Ajoute une règle `noRestrictedImports`
qui interdit `joi` et `typeorm` partout, `class-validator` dans `src/api/rest/**` et
`src/shared/config/**`, et tout import du client Prisma généré hors de
`src/infrastructure/database/**` (via `overrides`).

### `.gitignore`
Inclut `src/infrastructure/database/generated/`, `dist/`, `coverage/`, `.env`, `db-data/`.

### Docker
- `Dockerfile` :
  - stage `builder` (`node:24-bookworm`) : `yarn install --frozen-lockfile` (déclenche
    `prisma generate`), `yarn build`, `yarn generate-schema` ;
  - stage `migrate` (à partir de `builder`) : `CMD ["sh", "-c", "yarn db:deploy && yarn db:seed"]`
    — lancé comme job séparé avant chaque déploiement (ou service one-shot dans compose) ;
  - stage final `gcr.io/distroless/nodejs24-debian12` : copie `dist`, `node_modules`, le client
    généré s'il n'est pas déjà dans `dist`, et `src/schema.gql` vers `dist/src/schema.gql` ;
    `EXPOSE 3000`, `CMD ["dist/main"]`. Aucun CLI Prisma n'est nécessaire à l'exécution.
- `compose.dev.yml` : service `db` (`postgres:17-alpine`, `POSTGRES_DB/USER/PASSWORD=app`, données
  dans `./db-data`, healthcheck `pg_isready`) ; service `api` (`node:24-bookworm`, volume du code
  + volume nommé `node_modules`, `DATABASE_URL=postgresql://app:app@db:5432/app?schema=public`,
  `CHOKIDAR_USEPOLLING=true`, `depends_on: db: condition: service_healthy`, commande
  `yarn install && yarn db:deploy && yarn db:seed && yarn start:dev`).

### CI (GitHub Actions)
- `code_quality.yml` (`pull_request`) appelle `quality.yml`.
- `quality.yml` (`workflow_call`) : checkout, Node 24 avec cache yarn, `biomejs/setup-biome`,
  `biome ci .`, `yarn install --frozen-lockfile`, `yarn db:validate`, `yarn build`, `yarn test`.
  Un job additionnel avec un service `postgres:17` applique `yarn db:deploy` sur une base vide
  puis vérifie qu'aucune migration ne manque :
  `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code`
  (avec la base de shadow requise par la version installée).
- `release.yml` (`workflow_dispatch`) : réutilise `quality.yml`, puis `semantic-release`
  (`fetch-depth: 0`, permissions `contents/issues/pull-requests: write`).
- `.releaserc.json` : `branches: ["main"]`, plugins `commit-analyzer`,
  `release-notes-generator`, `github`.

## 11. Recette — ajouter une feature (à documenter dans `ARCHITECTURE.md`)

Pour un nouvel agrégat `Tag` :
1. Modèle `Tag` dans `prisma/schema.prisma` (`@@map`, `@map`, index), puis
   `yarn db:migrate --name add-tag` ; relire le SQL généré.
2. Modèle de domaine `shared/types/tag.type.ts` (classe pure).
3. Mapper `infrastructure/database/mappers/tag.mapper.ts` (`toTag(record: TagRecord)`) + barrel.
4. Repository `infrastructure/database/repositories/tag.repository.ts` (via `txHost.tx.tag`,
   `rethrowPrismaError` sur les écritures) + barrel (enregistré automatiquement par
   `Object.values(repositories)`).
5. Commands / Queries `domain/tag/{commands,queries}/*.ts` + barrels.
6. Handlers `domain/tag/handlers/*.handler.ts` (`@Transactional()` si plusieurs écritures) +
   `*.spec.ts` + barrel.
7. `domain/tag/index.ts` ; `export * from './tag'` dans `domain/index.ts` ;
   `...Object.values(tagHandlers)` dans `DomainModule`.
8. Codes d'erreur dans `ERROR_CODES` + traductions `fr`/`en`.
9. GraphQL : `inputs/tag.inputs.ts`, `types/tag.type.ts` (`fromDomain`),
   `resolvers/tag.resolver.ts` (+ barrels) ; DataLoader si `Tag` est un champ imbriqué.
10. REST : `dto/tag.dto.ts` (schémas Zod décrits + `createZodDto` + `fromDomain`),
    `controllers/tag.controller.ts` (`@ApiTags`, `@ApiErrorResponses`, versionné) + barrel.
11. Si la feature a besoin de variables d'environnement : `shared/config/tag.config.ts` (schéma
    Zod + `parseEnv`) et `.env.example`.

Une feature peut n'exister que sur un des deux transports : les étapes 1 à 8 ne changent pas.

## 12. Anti-patterns interdits

- Un resolver ou contrôleur qui appelle un repository ou `PrismaService` directement, ou qui
  contient de la logique métier.
- Un handler qui injecte `PrismaService` ou manipule un client de transaction : il passe par les
  repositories et `@Transactional()`.
- Un handler qui retourne un record Prisma, un type GraphQL ou un DTO REST.
- Un type ou enum généré par Prisma importé hors de `infrastructure/database/`.
- Un repository qui utilise `this.prisma.<model>` au lieu de `this.txHost.tx.<model>` (il
  sortirait silencieusement de la transaction en cours).
- Une lecture qui oublie le filtre `deletedAt: null`.
- Une méthode de repository qui accepte un `where` Prisma fourni par l'appelant.
- Laisser une erreur Prisma attendue (`P2002`, `P2025`) remonter sans la traduire en `AppError`.
- `prisma db push` ou `migrate dev` hors développement ; modifier une migration déjà appliquée ;
  migrer au démarrage de l'application.
- Un contrôleur qui renvoie un modèle de domaine sans passer par `XxxResponseDto.fromDomain`.
- Un modèle de domaine ou un repository qui importe depuis `api/`.
- Joi ou TypeORM n'importe où ; class-validator dans `api/rest/` ou dans la config ; un
  `@ApiProperty` manuel sur un DTO Zod ; un champ de DTO REST sans `.describe()`.
- Lire `process.env` ailleurs que dans un fichier de config Zod.
- Dupliquer un guard, un décorateur ou la logique de log/traduction d'erreurs par transport au
  lieu de l'écrire une fois dans `api/common/`.
- Omettre les décorateurs `class-validator` d'une Command/Query sous prétexte que le DTO ou
  l'input est déjà validé.
- Retourner `null` pour une ressource censée exister au lieu de lever `NotFoundError`.
- Lever une erreur avec un code absent de `ERROR_CODES` ou sans traduction.
- Un `console.log` au lieu du `LoggerService`.

## Livrables et vérification finale

1. Tous les fichiers ci-dessus, avec `README.md` (démarrage : `cp .env.example .env`,
   `docker compose -f compose.dev.yml up`, URLs GraphiQL et Swagger, commandes `db:*`) et
   `ARCHITECTURE.md` (couches, règle de validation, persistance Prisma, recette §11).
2. Exécute et corrige jusqu'à ce que tout passe : `yarn install`, `yarn db:validate`,
   `biome ci .`, `yarn build`, `yarn test`, `yarn generate-schema`.
3. Sur une base Postgres locale vide : `yarn db:deploy` puis `yarn db:seed` deux fois de suite
   (le second passage ne doit rien changer).
4. Vérifie qu'une variable d'env manquante ou invalide fait échouer le démarrage avec un message
   Zod lisible listant toutes les erreurs.
5. Démarre l'API et vérifie :
   - **GraphiQL** : `register` → `me` (avec Bearer) → `createProject` → `projects` →
     `refreshToken` → `logout` ; `project(id: "<uuid inconnu>")` renvoie HTTP 200 avec
     `extensions.code = "PROJECT_NOT_FOUND"` et un message en français (en anglais avec
     `Accept-Language: en`) ; un second `register` avec le même email renvoie `USER_EXISTS`.
   - **REST** (curl) : le même parcours sur `/v1/...` ; `GET /v1/projects/<uuid inconnu>` renvoie
     **404** `{ code: "PROJECT_NOT_FOUND", message, correlationId }` ; un `POST /v1/projects` avec
     `name: ""` renvoie **400** `VALIDATION_FAILED` avec `fields` traduits ; sans Bearer → **401** ;
     un projet supprimé n'apparaît plus dans `GET /v1/projects`.
   - **Swagger** (`/docs`) : chaque route affiche descriptions et exemples issus des schémas Zod,
     le schéma `ErrorResponse` avec l'énumération `ErrorCode`, et le bouton d'auth Bearer.
