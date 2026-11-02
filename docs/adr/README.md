# Décisions d'architecture (ADR)

Format court : contexte, décision, conséquences. Une nouvelle décision importante (nouveau module, nouvelle dépendance, nouveau pattern) = un nouveau fichier numéroté.

- [0001. Monolithe modulaire hexagonal](0001-monolithe-modulaire-hexagonal.md)
- [0002. Frontières vérifiées automatiquement (depguard + archcheck)](0002-verification-des-frontieres.md)
- [0003. Spec-first : un contrat unique, du code généré par module](0003-spec-first-openapi.md)
- [0004. Erreurs `{message, code}` et langue par Accept-Language](0004-format-erreur-et-langue.md)
- [0005. Un schéma Postgres, des migrations et un sqlc par module](0005-postgres-un-schema-par-module.md)
- [0006. Transactions pilotées par la couche app (TxManager à callback)](0006-transactions-pilotees-par-app.md)
- [0007. Cache Redis en décorateur, best-effort](0007-cache-redis-en-decorateur.md)
- [0008. Clients externes résilients et SDK Anthropic](0008-clients-externes-resilients.md)
- [0009. JWT d'accès court et refresh token opaque tournant](0009-authentification-jwt.md)
- [0010. Génération asynchrone des fiches par un worker](0010-generation-asynchrone-des-fiches.md)
- [0011. Règles structurées dans GameRulesDto (changement cassant)](0011-regles-structurees.md)
- [0012. Champs personnels de GameDto reportés](0012-composition-gamedto.md)
- [0013. Outils de génération épinglés via tools.mod](0013-outils-epingles.md)
- [0014. OpenTelemetry : export OTLP, no-op par défaut](0014-opentelemetry.md)
