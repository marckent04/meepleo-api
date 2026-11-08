import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { ErrorCode } from '@/shared/errors'

export const ErrorResponseSchema = z
  .object({
    code: z
      .enum(ErrorCode)
      .describe('Stable code the client branches its logic on'),
    message: z
      .string()
      .describe('Message translated per Accept-Language, displayable as is'),
    fields: z
      .array(
        z.object({
          field: z
            .string()
            .describe('Path of the invalid field (e.g. `items.0.name`)'),
          message: z.string().describe('Translated constraint message'),
        }),
      )
      .optional()
      .describe('Invalid fields (VALIDATION_FAILED only)'),
    correlationId: z.string().describe('To provide to support'),
  })
  // No .meta({ id }) on a DTO's root schema: with @nestjs/swagger 12,
  // cleanupOpenApiDoc would duplicate it. The OpenAPI component takes the name
  // of the class (ErrorResponseDto).
  .describe('Body of every error response')

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

export class ErrorResponseDto extends createZodDto(ErrorResponseSchema) {}
