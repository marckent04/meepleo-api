import { REDACTED, redactSecrets } from './redact.util'

describe('redactSecrets', () => {
  it('masks sensitive keys recursively, including in arrays', () => {
    const createdAt = new Date('2026-01-01T00:00:00Z')
    expect(
      redactSecrets({
        email: 'a@b.co',
        password: 'secret',
        nested: { refreshToken: 'rt', headers: { Authorization: 'Bearer x' } },
        items: [{ apiKey: 'k', name: 'n' }],
        createdAt,
      }),
    ).toEqual({
      email: 'a@b.co',
      password: REDACTED,
      nested: { refreshToken: REDACTED, headers: { Authorization: REDACTED } },
      items: [{ apiKey: REDACTED, name: 'n' }],
      createdAt,
    })
  })

  it('handles circular references and primitives', () => {
    const value: Record<string, unknown> = { name: 'loop' }
    value.self = value
    expect(redactSecrets(value)).toEqual({ name: 'loop', self: '[Circular]' })
    expect(redactSecrets('plain')).toBe('plain')
    expect(redactSecrets(null)).toBeNull()
  })
})
