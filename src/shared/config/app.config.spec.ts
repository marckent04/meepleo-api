import { APP_CONFIG } from './app.config'

describe('APP_CONFIG', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('applies defaults', () => {
    vi.stubEnv('NODE_ENV', undefined)
    vi.stubEnv('PORT', undefined)
    vi.stubEnv('npm_package_version', undefined)
    expect(APP_CONFIG()).toEqual({
      nodeEnv: 'development',
      port: 3000,
      version: '0.0.0',
    })
  })

  it('coerces PORT and reads NODE_ENV', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PORT', '8080')
    expect(APP_CONFIG()).toMatchObject({ nodeEnv: 'production', port: 8080 })
  })

  it('rejects an unknown NODE_ENV and an invalid PORT together', () => {
    vi.stubEnv('NODE_ENV', 'staging')
    vi.stubEnv('PORT', '-1')
    expect(() => APP_CONFIG()).toThrowError(/NODE_ENV[\s\S]*PORT/)
  })
})
