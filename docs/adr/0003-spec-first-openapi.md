# 0003. Spec-first : un contrat unique, du code généré par module

Statut : accepté (2026-11-01)

## Contexte

L'app Flutter et l'API évoluent en parallèle ; le contrat doit être la source de vérité. Générer une seule `ServerInterface` pour toute l'API couplerait les modules entre eux.

## Décision

- `api/openapi.yaml` (OpenAPI 3.0.3) décrit tout le contrat, y compris les modules pas encore écrits.
- oapi-codegen génère, pour chaque module, un serveur chi « strict » filtré par tag (`include-tags`) dans son `adapters/in/httpapi`.
- Le middleware de validation (kin-openapi via `oapi-codegen/nethttp-middleware`) valide paramètres et corps, et applique les exigences `security` de la spec.
- Swagger UI est servi sur `/docs` (assets chargés depuis un CDN, version épinglée) et peut être désactivé par `DOCS_ENABLED`.

## Conséquences

- Les routes publiques sont décidées par la spec, pas par du code.
- Les schémas communs (`Error`, `Game`) sont dupliqués dans le code généré de chaque module : c'est voulu, pour que les modules restent découplés.
- Swagger UI dépend d'un CDN ; à embarquer si une politique CSP stricte l'exige.
- Les opérations des modules non implémentés renvoient 404 jusqu'à leur arrivée.
