# Architecture de l'API Meepleo

API REST en Go, architecture hexagonale (ports et adapters) dans un monolithe modulaire. Ce document décrit l'arborescence, les règles de dépendance et leur vérification, la façon d'ajouter un module, et la communication entre modules jusqu'à l'extraction éventuelle d'un microservice. Les décisions et leurs compromis sont dans [`adr/`](adr/).

## 1. Arborescence

```
cmd/
  api/main.go                 composition root de l'API : config, logger, OTel, pools, modules, serveur
  worker/main.go              composition root du worker de génération des fiches
  migrate/main.go             applique les migrations de tous les modules (job de déploiement)
api/
  openapi.yaml                contrat complet, source de vérité (spec-first)
  embed.go                    embarque le contrat (servi sur /docs, utilisé par le validateur)
internal/
  platform/                   technique transverse, sans logique métier, n'importe aucun module
    config/                   variables d'environnement validées au démarrage
    logging/                  slog JSON, request_id ajouté depuis le contexte
    observability/            traces et métriques OpenTelemetry (OTLP, no-op si non configuré)
    httpserver/               routeur chi, middlewares, format d'erreur, validation OpenAPI, /healthz, /readyz, /docs, arrêt gracieux
    httpclient/               http.Client résilient : timeouts, retry + backoff + jitter, circuit breaker
    postgres/                 pool pgx instrumenté, WithTx ; postgrestest/ pour testcontainers
    redis/                    client go-redis instrumenté ; redistest/ pour testcontainers
    auth/                     Principal dans le contexte, middleware d'authentification best-effort
    i18n/                     négociation Accept-Language, catalogue de messages
  catalog/                    module « catalogue » (bounded context)
    domain/                   entités, value objects, règles, erreurs métier (stdlib uniquement)
    app/                      cas d'usage + ports (interfaces déclarées côté consommateur)
    adapters/
      in/httpapi/             handlers (code généré par oapi-codegen + mapping), erreurs HTTP
      in/worker/              boucle de génération pilotée par le temps
      out/postgres/           repository (sqlc)
      out/rediscache/         décorateurs de cache des ports
      out/claudeapi/          client du partenaire (Claude)
    contract/                 API publique pour les autres modules (stdlib uniquement)
    module.go                 câblage interne du module, exposé à la composition root
  identity/                   module « identité », même structure (sans contract tant que personne n'en a besoin)
migrations/
  <module>/NNNNN_*.sql        un dossier, un schéma Postgres et une table de version goose par module
tools/archcheck/              vérification automatique des frontières
scripts/dev-seed.sql          données de démo
docs/                         ce document, les ADR, le contrat d'API
```

Rôle des couches, de l'intérieur vers l'extérieur :

| Couche | Contient | Peut importer |
|---|---|---|
| `domain` | invariants métier, erreurs (`ErrGameNotFound`…), aucun tag json/db | la bibliothèque standard |
| `app` | cas d'usage, ports, pilotage des transactions | la stdlib et le `domain` du module |
| `adapters/in` | traduction transport → cas d'usage (HTTP, worker) | `app`, `domain`, `platform`, bibliothèques |
| `adapters/out` | implémentations des ports (Postgres, Redis, partenaires) | `app`, `domain`, `platform`, bibliothèques |
| `contract` | types et interface publics du module | la stdlib |
| `module.go` | câblage des adapters du module | tout le module, `platform`, les `contract` des autres |

## 2. Règles de dépendance et vérification

Les dépendances pointent vers l'intérieur : `adapters` → `app` → `domain`. Le domaine ne connaît ni pgx, ni Redis, ni chi, ni JSON ; chaque adapter a ses propres modèles (DTO générés, structs sqlc, structs de cache, modèle du partenaire) et fait le mapping explicitement.

Deux contrôles automatiques, lancés par `make lint` en local et par la CI :

1. **depguard** (`.golangci.yml`) couvre les règles qui ne dépendent que du chemin :
   - `internal/*/domain/**` et `internal/*/contract/**` : stdlib uniquement (`list-mode: strict`, `allow: [$gostd]`) ;
   - `internal/*/app/**` : interdiction explicite de `net/http`, `database/sql`, pgx, go-redis, chi, du SDK Anthropic et de `internal/platform`.
2. **`tools/archcheck`** couvre les règles relatives au module du package. Il lit `go list -json` (fichiers de test d'intégration inclus) et refuse :
   - un `domain` ou un `contract` qui importe autre chose que la stdlib ;
   - une couche `app` qui importe autre chose que la stdlib et le `domain` de son propre module ;
   - un module qui importe `domain`, `app`, `adapters` ou la racine d'un autre module (seul `contract` est permis) ;
   - un package hors de `internal/` (cmd, tests e2e…) qui importe les couches d'un module (seuls la racine et `contract` sont visibles) ;
   - `platform` qui importe un module ;
   - les packages fourre-tout (`utils`, `common`, `models`, `interfaces`…).

   Les règles « stdlib uniquement » ignorent les imports de test (testify), mais les règles entre modules s'appliquent aussi aux tests.

Côté données, chaque module a son **schéma Postgres** et son **entrée sqlc**, qui ne voit que les migrations du module : une requête sur la table d'un autre module échoue dès `make generate`.

Le compilateur garantit l'absence de cycle entre packages. Le câblage manuel dans `cmd/*/main.go`, sans framework d'injection, rend toutes les dépendances visibles à un seul endroit.

## 3. Ajouter un module métier

Exemple : un module `library` (ludothèque).

1. **Contrat d'abord** : dans `api/openapi.yaml`, les opérations du tag `library` existent déjà. Compléter leurs schémas si besoin.
2. **Structure** : créer `internal/library/{domain,app,adapters/in/httpapi,adapters/out/postgres,module.go}` sur le modèle de `catalog`.
3. **Génération** :
   - `internal/library/adapters/in/httpapi/oapi-codegen.yaml` avec `include-tags: [library]` ;
   - ajouter `library` à `MODULES` dans le Makefile ;
   - ajouter une entrée `library` dans `sqlc.yaml` (schéma `migrations/library`, requêtes du module).
4. **Migrations** : `migrations/library/00001_init.sql` crée le schéma `library` ; ajouter `"library"` à `migrations.Modules`.
5. **Dépendances vers d'autres modules** : déclarer le port dans `library/app` (par exemple `GameLookup`), l'implémenter dans `library/adapters/out/catalogmodule` en appelant `catalog/contract.API`, et le câbler dans `main.go` (voir section 4).
6. **Câblage** : `library.New(library.Deps{…})` et `Mount(router, validator)` dans `cmd/api/main.go`.
7. **Vérifier** : `make generate lint test test-int`. Toute importation qui franchit une frontière est refusée par l'archcheck.
8. **ADR** si le module introduit une dépendance ou un nouveau pattern.

Quelques points à garder en tête :
- n'écrire une interface que si un besoin réel existe (second adapter, décorateur, test) ;
- garder des ports petits (1 à 5 méthodes) ;
- ne rien mettre de métier dans `platform`.

## 4. Communication entre modules et extraction

### Aujourd'hui : appels en mémoire, via un contrat

Un module expose ce que les autres peuvent utiliser dans son package `contract`. Ce package ne dépend que de la stdlib : types simples, erreurs, interface (`catalog/contract.API` avec `Game(ctx, id)`). `catalog.Module` l'implémente.

Le module consommateur ne dépend pas du contrat dans son `app`. Il déclare son propre port, un adapter le traduit vers le contrat, et `main.go` relie les deux :

```
library/app            type GameLookup interface { Exists(ctx, id string) (bool, error) }
library/adapters/out/catalogmodule   implémente GameLookup en appelant catalog/contract.API
cmd/api/main.go        library.New(library.Deps{Games: catalogmodule.New(catalogModule)})
```

Le cœur de `library` ne sait donc pas que `catalog` existe : le jour où `catalog` change ou part, seul l'adapter bouge.

Règles :
- aucune lecture des tables d'un autre module ;
- aucune struct interne partagée ;
- les données d'un autre module sont obtenues par son contrat.

Quand un module devra réagir à ce qui se passe ailleurs (par exemple une partie terminée qui met à jour les statistiques du profil), on ajoutera des **événements** publiés via un **outbox Postgres** écrit dans la même transaction que le changement, puis relayés. Ce n'est pas construit tant qu'aucun cas réel ne le demande.

### Plus tard : extraire un module en service

Prenons `catalog`.

1. Le tag `catalog` d'`openapi.yaml` devient la spec du nouveau service ; son code HTTP est déjà généré à partir de ce seul tag.
2. Le schéma `catalog`, ses migrations et sa table de version goose partent tels quels.
3. Dans le monolithe, un `catalogclient` (construit avec `platform/httpclient`) implémente `catalog/contract.API` par des appels réseau. On remplace une ligne dans `main.go` ; les consommateurs ne changent pas.
4. L'authentification passe de HS256 (secret partagé) à EdDSA + JWKS, pour que le service extrait vérifie les jetons sans connaître le secret de signature (ADR 0009).
5. Les appels synchrones qui deviennent réseau doivent être revus : timeouts, cache, ou passage à des événements.

Le worker de génération montre déjà la forme cible d'un processus séparé : même image, binaire distinct, état partagé uniquement par la base du module.
