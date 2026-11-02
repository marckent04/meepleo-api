# 0010. Génération asynchrone des fiches par un worker

Statut : accepté (2026-11-01)

## Contexte

Une fiche complète (identification par recherche web et règles en deux langues) prend souvent entre 30 et 90 secondes et coûte des tokens. `init.sql` prévoyait une file avec un budget quotidien.

## Décision

- `GET /catalog/barcode/{code}` ne fait jamais d'appel au modèle.
- Un code inconnu, ou dont la réponse négative a expiré, est mis en file (`request_count` + 1, ce qui sert de priorité) et l'API répond **202** `{ status: "pending", retry_after_seconds }`.
- Le worker (`cmd/worker`, même image Docker) :
  - prend le code le plus demandé avec `FOR UPDATE SKIP LOCKED` et un bail (`locked_until`), puis appelle Claude hors de toute transaction ;
  - enregistre le résultat en une transaction ;
  - s'arrête quand le budget quotidien (compté dans `generation_attempts`, échecs compris) est atteint ;
  - en cas d'échec, replanifie le code avec un backoff ; au-delà de `MaxAttempts`, il le passe en `not_found` avec une date de nouvel essai.
- La réponse 200 devient `BarcodeLookup` : `found` avec `game`, ou `ambiguous` avec `candidates`.

## Conséquences

- **Changement de contrat** à coordonner avec l'équipe Flutter : la réponse 200 n'est plus un `GameDto`, l'app doit gérer le 202 (relancer l'appel après `retry_after_seconds`) et l'état `ambiguous`.
- Les requêtes restent courtes (timeout global de 10 s).
- Plusieurs workers peuvent tourner en parallèle.
- Une notification push remplacera le polling plus tard si besoin.
