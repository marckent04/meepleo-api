# 0006. Transactions pilotées par la couche app (TxManager à callback)

Statut : accepté (2026-11-01)

## Contexte

Certaines opérations écrivent plusieurs lignes qui doivent réussir ensemble : la fiche, sa résolution, la file et la tentative pour le worker ; l'utilisateur et son jeton pour identity. CLAUDE.md demande que les transactions soient pilotées par `app`, pas par les handlers.

## Décision

- Le port `TxManager.WithinTx(ctx, fn)` passe à `fn` des stores liés à la transaction.
- Pas de transaction cachée dans le `context.Context`.
- L'implémentation Postgres utilise `platform/postgres.WithTx` et `Queries.WithTx` de sqlc.

## Conséquences

- Les frontières de transaction sont visibles dans le code métier.
- Les fakes de test simulent le rollback (copie, puis publication si succès).
- Le décorateur de cache peut s'insérer autour du TxManager pour invalider après le commit.
