import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import type { HealthStatus } from '@/shared/types'

export const HealthResponseSchema = z
  .object({
    status: z.literal('ok').describe('The API and the database respond'),
    databaseLatencyMs: z
      .number()
      .int()
      .nonnegative()
      .describe('Database response time, in milliseconds')
      .meta({ example: 2 }),
    checkedAt: z.iso
      .datetime()
      .describe('Time of the check (ISO 8601, UTC)')
      .meta({ example: '2026-01-01T12:00:00.000Z' }),
  })
  .describe('API health status')

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
