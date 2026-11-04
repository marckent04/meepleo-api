import { z } from 'zod'
import { toZodErrorFields } from './zod-error-fields'

describe('toZodErrorFields', () => {
  it('maps each issue to a dotted path and a zod.<code> constraint', () => {
    const schema = z.object({
      name: z.string().min(1),
      items: z.array(z.object({ quantity: z.number().int() })),
    })
    const result = schema.safeParse({
      name: '',
      items: [{ quantity: 1 }, { quantity: 'two' }],
    })

    expect(result.success).toBe(false)
    expect(toZodErrorFields(result.error as z.ZodError)).toEqual([
      { field: 'name', constraint: 'zod.too_small' },
      { field: 'items.1.quantity', constraint: 'zod.invalid_type' },
    ])
  })
})
