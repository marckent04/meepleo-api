import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { ErrorCode } from '@/shared/errors'

export const ErrorResponseSchema = z
  .object({
    code: z
      .enum(ErrorCode)
      .describe('Code stable sur lequel le client branche sa logique'),
    message: z
      .string()
      .describe('Message traduit selon Accept-Language, affichable tel quel'),
    fields: z
      .array(
        z.object({
          field: z
            .string()
            .describe('Chemin du champ invalide (ex. `items.0.name`)'),
          message: z.string().describe('Message traduit de la contrainte'),
        }),
      )
      .optional()
      .describe('Champs invalides (VALIDATION_FAILED uniquement)'),
    correlationId: z.string().describe('À communiquer au support'),
  })
  // Pas de .meta({ id }) sur le schéma racine d'un DTO : avec @nestjs/swagger 12,
  // cleanupOpenApiDoc le dupliquerait. Le composant OpenAPI prend le nom de la
  // classe (ErrorResponseDto).
  .describe("Corps de toute réponse d'erreur")

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

export class ErrorResponseDto extends createZodDto(ErrorResponseSchema) {}
