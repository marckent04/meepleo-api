import { DATABASE_CONFIG, loadDatabaseEnv } from './database.config'

describe('database config', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('maps DATABASE_URL and defaults DB_POOL_MAX to 10', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://app:app@localhost:5432/app')
    vi.stubEnv('DB_POOL_MAX', undefined)
    expect(DATABASE_CONFIG()).toEqual({
      url: 'postgresql://app:app@localhost:5432/app',
      poolMax: 10,
    })
  })

  it('accepts the postgres:// protocol and coerces DB_POOL_MAX', () => {
    expect(
      loadDatabaseEnv({
        DATABASE_URL: 'postgres://app:app@db:5432/app',
        DB_POOL_MAX: '25',
      }),
    ).toEqual({
      DATABASE_URL: 'postgres://app:app@db:5432/app',
      DB_POOL_MAX: 25,
    })
  })

  it.each([
    ['missing', undefined],
    ['not a URL', 'not-a-url'],
    ['another protocol', 'mysql://app:app@localhost:3306/app'],
  ])('rejects a DATABASE_URL that is %s', (_label, url) => {
    expect(() => loadDatabaseEnv({ DATABASE_URL: url })).toThrowError(
      /DATABASE environment validation error[\s\S]*DATABASE_URL/,
    )
  })

  it('lists every invalid variable', () => {
    expect(() =>
      loadDatabaseEnv({ DATABASE_URL: 'nope', DB_POOL_MAX: '0' }),
    ).toThrowError(/DATABASE_URL[\s\S]*DB_POOL_MAX/)
  })
})
