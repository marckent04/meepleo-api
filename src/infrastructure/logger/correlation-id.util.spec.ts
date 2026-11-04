import { resolveCorrelationId } from './correlation-id.util'

describe('resolveCorrelationId', () => {
  it('reuses x-correlation-id, then x-request-id', () => {
    expect(
      resolveCorrelationId({
        headers: { 'x-correlation-id': 'abc', 'x-request-id': 'def' },
      }),
    ).toBe('abc')
    expect(resolveCorrelationId({ headers: { 'x-request-id': 'def' } })).toBe(
      'def',
    )
  })

  it('generates a UUID when no header is usable and memoizes it', () => {
    const request = { headers: { 'x-correlation-id': 'x'.repeat(500) } }
    const first = resolveCorrelationId(request)
    expect(first).toMatch(/^[0-9a-f-]{36}$/)
    expect(resolveCorrelationId(request)).toBe(first)
  })
})
