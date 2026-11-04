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
