export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 30
/** Letters, digits and underscore. */
export const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/
export const PASSWORD_MIN_LENGTH = 8
/** Upper bound: argon2 is costly, so we avoid hashing huge inputs. */
export const PASSWORD_MAX_LENGTH = 128
export const EMAIL_MAX_LENGTH = 254
