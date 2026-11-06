import { PasswordHasher } from './password-hasher'

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher()

  it('hashes with argon2id and verifies the password', async () => {
    const hash = await hasher.hash('s3cret-password')
    expect(hash).toMatch(/^\$argon2id\$/)
    expect(await hasher.verify(hash, 's3cret-password')).toBe(true)
    expect(await hasher.verify(hash, 'other-password')).toBe(false)
  })

  it('does not throw on a malformed hash', async () => {
    expect(await hasher.verify('not-a-hash', 'whatever')).toBe(false)
  })
})
