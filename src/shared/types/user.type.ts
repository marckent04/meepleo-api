/** User account. `email` and `username` are normalized to lowercase. */
export type User = {
  id: string
  email: string
  username: string
  createdAt: Date
}

/** Current user's account, with the number of games in each of their lists. */
export type CurrentUser = User & {
  catalogCount: number
  wishlistCount: number
  favoritesCount: number
}

/** User and argon2 fingerprint of their password (login only). */
export type UserCredentials = User & { passwordHash: string }

/** Token pair returned after a login or a refresh. */
export type AuthTokens = {
  accessToken: string
  refreshToken: string
  /** Access token lifetime, in seconds. */
  expiresIn: number
}
