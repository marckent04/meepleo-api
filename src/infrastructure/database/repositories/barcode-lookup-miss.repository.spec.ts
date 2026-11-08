import { createTransactionHostMock } from '@/__tests__/utils/prisma.mock'
import { BarcodeLookupMissRepository } from './barcode-lookup-miss.repository'

const code = '3421272109111'

describe('BarcodeLookupMissRepository', () => {
  it.each([
    [{ id: '0195d1a2-0000-7000-8000-000000000001' }, true],
    [null, false],
  ])(
    'tells whether a barcode was not found before (%o)',
    async (record, expected) => {
      const { host, tx } = createTransactionHostMock({
        barcodeLookupMiss: { findUnique: vi.fn().mockResolvedValue(record) },
      })

      await expect(
        new BarcodeLookupMissRepository(host).exists(code),
      ).resolves.toBe(expected)
      expect(tx.barcodeLookupMiss.findUnique).toHaveBeenCalledWith({
        where: { code },
        select: { id: true },
      })
    },
  )

  it('records a miss, ignoring an already recorded barcode', async () => {
    const { host, tx } = createTransactionHostMock({
      barcodeLookupMiss: {
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    })

    await new BarcodeLookupMissRepository(host).record(code)

    expect(tx.barcodeLookupMiss.createMany).toHaveBeenCalledWith({
      data: [{ code }],
      skipDuplicates: true,
    })
  })
})
