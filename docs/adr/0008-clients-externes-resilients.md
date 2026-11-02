# 0008. Clients externes résilients et SDK Anthropic

Statut : accepté (2026-11-01)

## Contexte

Les appels à Claude sont lents (recherche web), coûteux et parfois refusés en surcharge (429, 529).

## Décision

- `platform/httpclient` construit un `http.Client` par partenaire : otelhttp → retry (backoff exponentiel avec jitter complet, `Retry-After`, uniquement sur erreurs transitoires) → circuit breaker (sony/gobreaker v2) → `http.Transport` aux timeouts explicites.
- Les méthodes non idempotentes ne sont pas rejouées, sauf option explicite.
- Le SDK officiel `anthropic-sdk-go` reçoit ce client (`option.WithHTTPClient`) et ses propres retries sont coupés (`WithMaxRetries(0)`).

## Conséquences

- Une politique de résilience homogène pour tous les partenaires, testée une fois.
- `RetryNonIdempotent` est activé pour Claude, parce que générer une fiche n'a pas d'effet de bord ; à ne jamais activer pour une API qui crée des ressources.
- Le modèle de réponse du partenaire ne sort jamais de l'adapter.
