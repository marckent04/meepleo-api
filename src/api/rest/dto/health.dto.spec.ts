import { HealthStatus } from '@/shared/types'
import { HealthResponseDto, HealthResponseSchema } from './health.dto'

describe('HealthResponseDto', () => {
  it('maps the domain model to a valid response', () => {
    const response = HealthResponseDto.fromDomain(
      new HealthStatus(3, new Date('2026-01-01T12:00:00.000Z')),
    )
    expect(response).toEqual({
      status: 'ok',
      databaseLatencyMs: 3,
      checkedAt: '2026-01-01T12:00:00.000Z',
    })
    expect(HealthResponseSchema.safeParse(response).success).toBe(true)
  })

  it('rejects a non ISO date and a negative latency', () => {
    expect(
      HealthResponseSchema.safeParse({
        status: 'ok',
        databaseLatencyMs: -1,
        checkedAt: 'yesterday',
      }).success,
    ).toBe(false)
  })
})
