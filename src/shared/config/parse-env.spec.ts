import { z } from 'zod'
import { parseEnv } from './parse-env'

describe('parseEnv', () => {
  const schema = z.object({
    PORT: z.coerce.number().int(),
    NAME: z.string().min(1),
  })

  it('returns the parsed values and ignores unknown variables', () => {
    expect(
      parseEnv(schema, 'TEST', { PORT: '3000', NAME: 'api', OTHER: 'x' }),
    ).toEqual({ PORT: 3000, NAME: 'api' })
  })

  it('reports every invalid variable at once', () => {
    expect(() => parseEnv(schema, 'TEST', { PORT: 'abc' })).toThrowError(
      /TEST environment validation error[\s\S]*PORT[\s\S]*NAME/,
    )
  })
})
