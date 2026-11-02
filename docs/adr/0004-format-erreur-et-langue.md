# 0004. Erreurs `{message, code}` et langue par Accept-Language

Statut : accepté (2026-11-01)

## Contexte

CLAUDE.md propose RFC 7807 « ou le format défini dans le YAML ». Le contrat mobile, déjà implémenté côté app, attend `{ "message": "…" }` avec un message traduit et affichable.

## Décision

- Le corps d'erreur est `{ "message", "code" }`. `code` est un ajout optionnel, stable, qui ne casse pas l'app.
- La langue (fr ou en, fr par défaut) est négociée une fois par requête depuis `Accept-Language` (`golang.org/x/text/language`).
- Chaque module a son catalogue de messages dans son adapter HTTP. Les erreurs métier sont définies dans le domaine et traduites en statuts HTTP uniquement dans `adapters/in/httpapi`.
- Une erreur imprévue donne un 500 générique ; la cause reste dans les logs.

## Conséquences

- Pas de RFC 7807. Si un autre client l'exige un jour, il pourra être ajouté par négociation de contenu.
- Les textes sont maintenus dans le code pour fr et en.
