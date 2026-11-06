/**
 * Inventaire contractuel des codes d'erreur exposés aux clients.
 * On ajoute un code ; on n'en renomme ni n'en supprime jamais.
 * Chaque code doit être traduit dans src/i18n/<lang>/errors.json.
 */
export enum ErrorCode {
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  UNPROCESSABLE_ENTITY = 'UNPROCESSABLE_ENTITY',
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  HEALTH_CHECK_FAILED = 'HEALTH_CHECK_FAILED',
  GAME_NOT_FOUND = 'GAME_NOT_FOUND',
  GAME_SHEET_GENERATION_FAILED = 'GAME_SHEET_GENERATION_FAILED',
  GAME_SHEET_TRANSLATION_FAILED = 'GAME_SHEET_TRANSLATION_FAILED',
  LANGUAGE_REQUIRED = 'LANGUAGE_REQUIRED',
  UNSUPPORTED_LANGUAGE = 'UNSUPPORTED_LANGUAGE',
  EMAIL_ALREADY_USED = 'EMAIL_ALREADY_USED',
  USERNAME_ALREADY_USED = 'USERNAME_ALREADY_USED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  INVALID_REFRESH_TOKEN = 'INVALID_REFRESH_TOKEN',
}

export const ERROR_CODES: Record<
  ErrorCode,
  { expected: boolean; description: string }
> = {
  [ErrorCode.BAD_REQUEST]: {
    expected: true,
    description: 'Requête invalide',
  },
  [ErrorCode.UNAUTHENTICATED]: {
    expected: true,
    description: 'Authentification requise ou invalide',
  },
  [ErrorCode.FORBIDDEN]: {
    expected: true,
    description: 'Action non autorisée',
  },
  [ErrorCode.NOT_FOUND]: {
    expected: true,
    description: 'Ressource introuvable',
  },
  [ErrorCode.CONFLICT]: {
    expected: true,
    description: 'Conflit avec une ressource existante',
  },
  [ErrorCode.UNPROCESSABLE_ENTITY]: {
    expected: true,
    description: 'Règle métier non respectée',
  },
  [ErrorCode.TOO_MANY_REQUESTS]: {
    expected: true,
    description: 'Trop de requêtes',
  },
  [ErrorCode.VALIDATION_FAILED]: {
    expected: true,
    description: 'Données envoyées invalides (voir fields)',
  },
  [ErrorCode.INTERNAL_SERVER_ERROR]: {
    expected: false,
    description: 'Erreur interne inattendue',
  },
  [ErrorCode.HEALTH_CHECK_FAILED]: {
    expected: false,
    description: "Le contrôle de santé de l'API a échoué",
  },
  [ErrorCode.GAME_NOT_FOUND]: {
    expected: true,
    description: 'Jeu introuvable',
  },
  [ErrorCode.GAME_SHEET_GENERATION_FAILED]: {
    expected: false,
    description: "La génération de la fiche de règles par l'IA a échoué",
  },
  [ErrorCode.GAME_SHEET_TRANSLATION_FAILED]: {
    expected: false,
    description: "La traduction de la fiche de règles par l'IA a échoué",
  },
  [ErrorCode.LANGUAGE_REQUIRED]: {
    expected: true,
    description: "L'en-tête Accept-Language est obligatoire",
  },
  [ErrorCode.UNSUPPORTED_LANGUAGE]: {
    expected: true,
    description: "Aucune langue d'Accept-Language n'est supportée",
  },
  [ErrorCode.EMAIL_ALREADY_USED]: {
    expected: true,
    description: 'Un compte existe déjà avec cet email',
  },
  [ErrorCode.USERNAME_ALREADY_USED]: {
    expected: true,
    description: "Ce nom d'utilisateur est déjà pris",
  },
  [ErrorCode.INVALID_CREDENTIALS]: {
    expected: true,
    description: "Nom d'utilisateur ou mot de passe incorrect",
  },
  [ErrorCode.INVALID_REFRESH_TOKEN]: {
    expected: true,
    description: 'Refresh token invalide, expiré ou révoqué',
  },
}

export function isErrorCode(code: unknown): code is ErrorCode {
  return typeof code === 'string' && Object.hasOwn(ERROR_CODES, code)
}

/** Code générique utilisé quand une erreur n'a pas de code spécifique. */
export function genericErrorCodeForStatus(statusCode: number): ErrorCode {
  switch (statusCode) {
    case 400:
      return ErrorCode.BAD_REQUEST
    case 401:
      return ErrorCode.UNAUTHENTICATED
    case 403:
      return ErrorCode.FORBIDDEN
    case 404:
      return ErrorCode.NOT_FOUND
    case 409:
      return ErrorCode.CONFLICT
    case 422:
      return ErrorCode.UNPROCESSABLE_ENTITY
    case 429:
      return ErrorCode.TOO_MANY_REQUESTS
    default:
      return statusCode < 500
        ? ErrorCode.BAD_REQUEST
        : ErrorCode.INTERNAL_SERVER_ERROR
  }
}
