# 0007. Cache Redis en décorateur, best-effort

Statut : accepté (2026-11-01)

## Contexte

Les fiches de jeu sont lues très souvent et changent rarement. Redis doit accélérer sans devenir un point de panne.

## Décision

- `rediscache.CachedGames` décore le port `Games` en lecture : clés `catalog:game:v1:<id>` et `catalog:barcode:v1:<ean>`, TTL d'une heure.
- Un code-barre en attente n'est jamais mis en cache, et une réponse négative ne l'est pas au-delà de sa date de nouvel essai.
- `CachedTx` décore le TxManager et invalide les clés touchées après le commit.
- Toute erreur Redis est loguée puis on retombe sur Postgres.
- Le cache négatif des codes inconnus est persistant en base (`barcodes.status` + `retry_after`) : il n'y a pas de cache Redis devant le modèle.

## Conséquences

- Le service métier ignore l'existence du cache.
- `/readyz` signale Redis indisponible, comme le demande CLAUDE.md, alors que les requêtes continuent de fonctionner sans lui. Compromis à rediscuter si l'orchestrateur retire trop facilement les instances du trafic.
- Pas de données sensibles en cache (identity n'a pas de cache).
