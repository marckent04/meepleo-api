import { LOGGER_CONFIG } from './logger.config'

describe('LOGGER_CONFIG', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('defaults to warn and error', () => {
    vi.stubEnv('LOG_LEVELS', undefined)
    expect([...LOGGER_CONFIG().levels]).toEqual(['warn', 'error'])
  })

  it('parses a CSV list with spaces', () => {
    vi.stubEnv('LOG_LEVELS', 'info, warn ,error')
    expect([...LOGGER_CONFIG().levels]).toEqual(['info', 'warn', 'error'])
  })

  it('rejects unknown levels', () => {
    vi.stubEnv('LOG_LEVELS', 'info,verbose')
    expect(() => LOGGER_CONFIG()).toThrowError(/LOG_LEVELS/)
  })

  it('rejects duplicates', () => {
    vi.stubEnv('LOG_LEVELS', 'info,info')
    expect(() => LOGGER_CONFIG()).toThrowError(/duplicates/)
  })
})
