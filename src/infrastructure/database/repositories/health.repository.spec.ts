import { createTransactionHostMock } from '@/__tests__/utils/prisma.mock'
import { HealthRepository } from './health.repository'

describe('HealthRepository', () => {
  it('pings the database through the transaction host', async () => {
    const { host, tx } = createTransactionHostMock({
      $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    })

    await new HealthRepository(host).ping()

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
  })

  it('propagates driver errors', async () => {
    const failure = new Error('connection refused')
    const { host } = createTransactionHostMock({
      $queryRaw: vi.fn().mockRejectedValue(failure),
    })

    await expect(new HealthRepository(host).ping()).rejects.toBe(failure)
  })
})
