/** Compte utilisateur. `email` et `username` sont normalisés en minuscules. */
export type User = {
  id: string
  email: string
  username: string
  createdAt: Date
}

/** Compte de l'utilisateur connecté, avec le nombre de jeux de chacune de ses listes. */
export type CurrentUser = User & {
  catalogCount: number
  wishlistCount: number
  favoritesCount: number
}

/** Utilisateur et empreinte argon2 de son mot de passe (login uniquement). */
export type UserCredentials = User & { passwordHash: string }

/** Paire de tokens renvoyée après un login ou un refresh. */
export type AuthTokens = {
  accessToken: string
  refreshToken: string
  /** Durée de vie de l'access token, en secondes. */
  expiresIn: number
}
