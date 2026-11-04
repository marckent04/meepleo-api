import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import type { HealthStatus } from '@/shared/types'

export const HealthResponseSchema = z
  .object({
    status: z.literal('ok').describe("L'API et la base de données répondent"),
    databaseLatencyMs: z
      .number()
      .int()
      .nonnegative()
      .describe('Temps de réponse de la base de données, en millisecondes')
      .meta({ example: 2 }),
    checkedAt: z.iso
      .datetime()
      .describe('Date du contrôle (ISO 8601, UTC)')
      .meta({ example: '2026-01-01T12:00:00.000Z' }),
  })
  .describe("État de santé de l'API")

export class HealthResponseDto extends createZodDto(HealthResponseSchema, {
  codec: true,
}) {
  static fromDomain(health: HealthStatus): HealthResponseDto {
    return {
      status: 'ok',
      databaseLatencyMs: health.databaseLatencyMs,
      checkedAt: health.checkedAt.toISOString(),
    }
  }
}
