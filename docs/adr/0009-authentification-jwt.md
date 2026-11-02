# 0009. JWT d'accès court et refresh token opaque tournant

Statut : accepté (2026-11-01)

## Contexte

Le contrat prévoit JWT et refresh token, avec des comptes invités et un seul appareil par utilisateur. Sur un 401, l'app renouvelle ses jetons et rejoue la requête une fois.

## Décision

- Le jeton d'accès est un JWT HS256 de 15 minutes (sub, iss, aud, iat, exp), vérifié sans état.
- Le refresh token est une valeur aléatoire de 256 bits ; seul son hash SHA-256 est stocké.
- À chaque renouvellement, le jeton est remplacé (rotation). Présenter un jeton déjà remplacé révoque toute sa famille, ce qui détecte un vol.
- Le middleware d'auth est best-effort : il n'attache le Principal que si le bearer est valide. Ce sont les exigences `security` de la spec qui produisent les 401 ; sinon, `/auth/refresh` appelé avec un jeton d'accès expiré serait rejeté.

## Conséquences

- Une fuite de la base ne fuit pas de refresh token utilisable.
- Deux renouvellements concurrents avec le même jeton : un seul gagne (garde SQL `revoked_at IS NULL`), sans punir la famille. Le client doit sérialiser ses renouvellements.
- Pour extraire un service, passer à EdDSA et publier un JWKS.
- À faire : limiter le débit de `/auth/guest`.
