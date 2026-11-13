import { DateTimeSchema, UpdatedSinceQuerySchema } from './sync-fields.dto'

describe('request dates', () => {
  it.each(['2026-11-12T19:00:00Z', '2026-11-12T19:00:00.000Z'])(
    'accepts the UTC date %s',
    (date) => {
      expect(DateTimeSchema.safeParse(date).success).toBe(true)
    },
  )

  it.each([
    '2026-11-12T19:00:00+02:00',
    '2026-11-12T19:00:00-05:00',
    '2026-11-12T19:00:00',
    '2026-11-12',
    'yesterday',
  ])('rejects the non-UTC date %s', (date) => {
    expect(DateTimeSchema.safeParse(date).success).toBe(false)
  })

  it('applies to the updatedSince query', () => {
    expect(
      UpdatedSinceQuerySchema.safeParse({
        updatedSince: '2026-11-12T19:00:00+02:00',
      }).success,
    ).toBe(false)
  })
})
