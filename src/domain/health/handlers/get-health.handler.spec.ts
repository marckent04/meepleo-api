import { Test } from '@nestjs/testing'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import { HealthRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { HealthStatus } from '@/shared/types'
import { GetHealthQuery } from '../queries'
import { GetHealthHandler } from './get-health.handler'

describe('GetHealthHandler', () => {
  let handler: GetHealthHandler
  const healthRepository = { ping: vi.fn() }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        GetHealthHandler,
        { provide: HealthRepository, useValue: healthRepository },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile()
    handler = moduleRef.get(GetHealthHandler)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('pings the database and returns a health status', async () => {
    healthRepository.ping.mockResolvedValue(undefined)

    const health = await handler.execute(new GetHealthQuery())

    expect(healthRepository.ping).toHaveBeenCalledTimes(1)
    expect(health).toBeInstanceOf(HealthStatus)
    expect(health.databaseLatencyMs).toBeGreaterThanOrEqual(0)
    expect(health.checkedAt).toBeInstanceOf(Date)
  })

  it('propagates a database failure', async () => {
    healthRepository.ping.mockRejectedValue(new Error('db down'))

    await expect(handler.execute(new GetHealthQuery())).rejects.toThrow(
      'db down',
    )
  })
})
