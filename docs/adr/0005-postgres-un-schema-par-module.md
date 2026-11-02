# 0005. Un schéma Postgres, des migrations et un sqlc par module

Statut : accepté (2026-11-01)

## Contexte

Un module ne doit jamais lire les tables d'un autre. Le schéma de départ du catalogue (`init.sql`) a été conçu hors de cette contrainte.

## Décision

- Chaque module a son schéma (`catalog`, `identity`), son dossier `migrations/<module>`, sa table de version goose (`public.<module>_goose_db_version`) et son entrée sqlc, qui ne voit que ses migrations.
- Les migrations sont embarquées et appliquées par `cmd/migrate` (job de déploiement), jamais au démarrage de l'API.
- Le schéma catalog reprend `init.sql`, avec ces adaptations :
  - tout est placé dans le schéma `catalog` ;
  - les identifiants passent en `IDENTITY` et sont exposés en string dans l'API ;
  - ajout de `categories`, `image_url` et `art_key` dans `games` ;
  - ajout de `locked_until` dans `generation_queue` ;
  - nouvelle table `generation_attempts` ;
  - `barcode_submissions` et `game_reports` sont reportées.
- Les identifiants utilisateurs sont des UUIDv7 générés par Postgres 18, parce qu'ils apparaissent dans les jetons et ne doivent pas être énumérables.

## Conséquences

- Une requête qui touche une table étrangère échoue à la génération.
- Pas de clé étrangère entre modules : les références croisées (par exemple `user_id`) sont des valeurs simples, sans contrainte.
- Les migrations doivent rester compatibles avec la version précédente du code (déploiement progressif).
