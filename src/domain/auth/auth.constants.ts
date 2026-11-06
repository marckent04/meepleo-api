export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 30
/** Lettres, chiffres et underscore. */
export const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/
export const PASSWORD_MIN_LENGTH = 8
/** Borne haute : argon2 est coûteux, on évite d'hasher des entrées géantes. */
export const PASSWORD_MAX_LENGTH = 128
export const EMAIL_MAX_LENGTH = 254
