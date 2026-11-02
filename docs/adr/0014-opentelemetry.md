# 0014. OpenTelemetry : export OTLP, no-op par défaut

Statut : accepté (2026-11-01)

## Contexte

On veut des traces et des métriques sur les entrées HTTP, les requêtes SQL, Redis et les appels sortants, sans dépendre d'un fournisseur.

## Décision

- SDK OpenTelemetry avec exporteurs OTLP/HTTP configurés par les variables `OTEL_*` standard.
- Sans endpoint configuré, les fournisseurs no-op restent en place.
- Instrumentation : otelhttp (serveur, avec span et métrique nommés d'après la route chi, et client), otelpgx sans les paramètres de requête (ils peuvent contenir des hashes de jetons), redisotel sans les commandes, et un span par itération du worker.

## Conséquences

- Brancher Jaeger, Tempo ou un collecteur ne demande qu'une variable d'environnement.
- Pas d'endpoint Prometheus `/metrics` : à ajouter si l'infrastructure le préfère au push OTLP.
