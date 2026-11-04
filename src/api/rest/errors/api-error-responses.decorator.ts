import { applyDecorators } from '@nestjs/common'
import { ApiResponse } from '@nestjs/swagger'
import { ErrorResponseDto } from './error-response.dto'

const DESCRIPTIONS: Record<number, string> = {
  400: 'Requête invalide (VALIDATION_FAILED, BAD_REQUEST)',
  401: 'Authentification requise',
  403: 'Action non autorisée',
  404: 'Ressource introuvable',
  409: 'Conflit avec une ressource existante',
  422: 'Règle métier non respectée',
  429: 'Trop de requêtes',
  500: 'Erreur interne',
}

/** Documente dans Swagger les réponses d'erreur possibles d'une route. */
export const ApiErrorResponses = (...statuses: number[]) =>
  applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: DESCRIPTIONS[status],
        type: ErrorResponseDto,
      }),
    ),
  )
