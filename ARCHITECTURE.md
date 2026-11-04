# Architecture

## Principe directeur

Les adaptateurs de transport (contrôleurs REST) ne contiennent **jamais** de logique métier.
Ils traduisent une requête en Command/Query, la dispatchent sur le bus CQRS, puis traduisent
le résultat en DTO de réponse. Tout ce qui décide *ce qui se passe* vit dans `domain/`.

## Couches

```
src/
├── api/              transport HTTP
│   ├── common/       transverse : throttling, filtre d'exception, intercepteurs, erreurs
│   └── rest/         contrôleurs, DTO Zod, validation, Swagger
├── domain/           Commands, Queries, handlers (un dossier par feature)
├── infrastructure/   base de données (Prisma), logger, i18n, adapters externes
├── shared/           config Zod, erreurs, locales, modèles de domaine (aucune dépendance)
├── utils/            AppCommandHandler / AppQueryHandler
└── i18n/{fr,en}/     traductions (errors.json, validation.json)
```

Les dépendances vont dans un seul sens : `api` → `domain` → `infrastructure`. `shared` ne
dépend de rien et peut être importé partout.

- Seul `infrastructure/database/` connaît Prisma. Aucun type généré
  (`infrastructure/database/generated/`) n'est importé ailleurs : Biome le refuse
  (`noRestrictedImports`).
- `api/` n'importe jamais `infrastructure/database`.
- Les handlers retournent des **modèles de domaine** (`shared/types`), jamais un record Prisma
  ni un DTO.
- Les modules de transport n'importent pas `DomainModule` : le bus est global
  (`CqrsModule.forRoot()` dans `InfrastructureModule`).

## Règle de validation

| Zone | Outil |
|---|---|
| Configuration (`shared/config/*`, `database.config.ts`, `prisma.config.ts`) | Zod uniquement, via `parseEnv` |
| REST (`api/rest/**`) : body, params, query string, réponses, erreurs | Zod uniquement (`nestjs-zod`) ; la doc Swagger vient des schémas (`.describe()`, `.meta()`) |
| Domaine (Commands / Queries) | class-validator : filet de sécurité indépendant du transport |

Joi et TypeORM ne sont pas installés. `process.env` n'est lu que dans les fichiers de config
Zod.

Une erreur de validation produit toujours la même réponse, quelle que soit la bibliothèque qui
l'a détectée : `400 VALIDATION_FAILED` avec des `fields` traduits. Zod donne des contraintes
`zod.<issue code>`, class-validator des contraintes `isEmail`, `min`, etc. Toutes sont
traduites dans `validation.json`.

## Erreurs

- `shared/errors/error-codes.ts` est l'inventaire contractuel des codes : on en ajoute, on n'en
  renomme ni n'en supprime jamais.
- On lève une `AppError` (`NotFoundError`, `ConflictError`, `BusinessRuleError`…). Son message
  n'est que loggé : le client reçoit le message traduit associé au code.
- `AppExceptionFilter` est le seul endroit qui logue une erreur de requête. Il répond avec le
  vrai statut HTTP et le corps `ErrorResponseDto` `{ code, message, fields?, correlationId }`,
  traduit selon `Accept-Language` (`fr` par défaut, `en`).
- `@ErrorCodeOnFailure(code)` remplace le `INTERNAL_SERVER_ERROR` générique d'une route par un
  code métier, et laisse intactes les erreurs client.
- `@ApiErrorResponses(400, 404, …)` documente les erreurs d'une route dans Swagger.

Pour ajouter une erreur : ajoute le code dans `ERROR_CODES`, puis son message dans
`fr/errors.json` et `en/errors.json`, puis lève `throw new NotFoundError('…', { code: ErrorCode.X })`.
`translations.spec.ts` échoue si une traduction manque.

## Persistance Prisma

- Le schéma est dans `prisma/schema.prisma`. L'URL vient de `prisma.config.ts`, qui réutilise
  la validation Zod de l'application (`loadDatabaseEnv`) et charge `.env` s'il existe.
- Le client est généré dans `src/infrastructure/database/generated/` (gitignoré) et
  `PrismaService` l'instancie avec le driver adapter `@prisma/adapter-pg`.
- Conventions : modèles en `PascalCase` singulier, `@@map("snake_case_pluriel")`, colonnes en
  `@map("snake_case")`, ids `String @id @db.Uuid`, dates `DateTime @db.Timestamptz(6)`, soft
  delete par `deletedAt DateTime?`.
- Les mappers (`database/mappers/<model>.mapper.ts`) sont le **seul** endroit qui convertit un
  record Prisma en modèle de domaine. Les types générés y sont aliasés `XxxRecord`.
- Les repositories passent **toujours** par `this.txHost.tx.<model>` (`TransactionHost` de
  `@nestjs-cls/transactional`). Hors transaction, c'est le client normal ; dans un handler
  `@Transactional()`, c'est le client de la transaction. Aucun paramètre `tx` ne circule.
- Les méthodes de repository ont un nom explicite et une signature étroite. Elles n'acceptent
  jamais un `where` Prisma venu de l'appelant. Chaque lecture filtre `deletedAt: null`.
- `rethrowPrismaError` traduit les erreurs connues (`P2002` → `ConflictError`, `P2025` →
  `NotFoundError`, `P2003` → `BadRequestError`).
- Migrations : `yarn db:migrate --name <change>` en développement (relis le SQL et versionne-le),
  `yarn db:deploy` en CI et en production. L'application ne migre jamais au démarrage.
- `prisma/seed.ts` ne fait que des `upsert` : on peut le rejouer à volonté.

## Logs

- `LoggerService` (transient) : `setContext(name)`, `trace` … `fatal`, `assign(fields)` pour
  ajouter des champs à tous les logs de la requête. Chaque log porte le `correlationId`, repris
  de `x-correlation-id` / `x-request-id` ou généré.
- `LOG_LEVELS` fixe l'ensemble exact des niveaux émis. Les niveaux sont mappés en `severity`
  Cloud Logging. La sortie est `pino-pretty` en développement, JSON ailleurs.
- `redactSecrets` masque les clés sensibles avant de logger des `details`.
- `console.log` est interdit (Biome `noConsole`).

## Recette : ajouter une feature REST

Exemple avec un agrégat `Tag` :

1. Ajoute le modèle `Tag` dans `prisma/schema.prisma` (`@@map`, `@map`, index), puis lance
   `yarn db:migrate --name add-tag` et relis le SQL généré.
2. Crée le modèle de domaine `shared/types/tag.type.ts` (classe pure) et exporte-le dans
   `shared/types/index.ts`.
3. Crée le mapper `infrastructure/database/mappers/tag.mapper.ts`
   (`toTag(record: TagRecord)`) avec son barrel `mappers/index.ts`.
4. Crée le repository `infrastructure/database/repositories/tag.repository.ts`
   (`txHost.tx.tag`, `rethrowPrismaError` sur les écritures) et exporte-le dans le barrel :
   il est enregistré automatiquement par `Object.values(repositories)`.
5. Crée les Commands / Queries `domain/tag/{commands,queries}/*.ts` (décorateurs
   class-validator, constructeur à objet de paramètres) avec leurs barrels.
6. Crée les handlers `domain/tag/handlers/*.handler.ts` (`AppCommandHandler` /
   `AppQueryHandler`, `@Transactional()` s'il y a plusieurs écritures), un `*.handler.spec.ts`
   par handler, et le barrel.
7. Crée `domain/tag/index.ts`, ajoute `export * from './tag'` dans `domain/index.ts` et
   `...Object.values(tagHandlers)` dans `DomainModule`.
8. Ajoute les codes d'erreur dans `ERROR_CODES` et leurs traductions `fr` / `en`.
9. REST : crée `api/rest/dto/tag.dto.ts` (schémas Zod décrits, `createZodDto`, `fromDomain`)
   et `api/rest/controllers/tag.controller.ts` (`@ApiTags`, `@ZodResponse`,
   `@ApiErrorResponses`, `version: '1'`), puis exporte-les dans leurs barrels.
10. Si la feature a besoin de variables d'environnement, crée `shared/config/tag.config.ts`
    (schéma Zod + `parseEnv` + `registerAs`) et complète `.env.example`.

Dans un DTO de réponse, ne mets pas de `.meta({ id })` sur le schéma racine : avec
`@nestjs/swagger` 12, `cleanupOpenApiDoc` le dupliquerait. Le composant OpenAPI prend le nom
de la classe DTO. `.meta({ example })` sur les champs ne pose pas de problème.

## Anti-patterns interdits

- Un contrôleur qui appelle un repository ou `PrismaService`, ou qui contient de la logique
  métier.
- Un handler qui injecte `PrismaService` ou manipule un client de transaction.
- Un handler qui retourne un record Prisma ou un DTO.
- Un type Prisma généré importé hors de `infrastructure/database/`.
- `this.prisma.<model>` au lieu de `this.txHost.tx.<model>` dans un repository.
- Une lecture qui oublie `deletedAt: null`, ou une méthode de repository qui accepte un `where`
  Prisma.
- Une erreur Prisma attendue (`P2002`, `P2025`) qui remonte sans être traduite.
- `prisma db push` ou `migrate dev` hors développement, ou une migration déjà appliquée qui est
  modifiée.
- Un contrôleur qui renvoie un modèle de domaine sans `XxxResponseDto.fromDomain`.
- class-validator dans `api/rest/` ou dans la config, un `@ApiProperty` manuel sur un DTO Zod,
  ou un champ de DTO sans `.describe()`.
- Lire `process.env` hors d'un fichier de config Zod.
- Une Command/Query sans décorateurs class-validator.
- Retourner `null` pour une ressource censée exister au lieu de lever `NotFoundError`.
- Un code d'erreur absent de `ERROR_CODES` ou sans traduction.
