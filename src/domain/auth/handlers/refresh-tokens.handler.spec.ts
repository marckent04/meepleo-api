import { Test } from '@nestjs/testing'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import { TokenService } from '@/infrastructure/adapters/auth'
import {
  RefreshTokenRepository,
  UserRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { ErrorCode } from '@/shared/errors'
import { RefreshTokensCommand } from '../commands'
import { RefreshTokensHandler } from './refresh-tokens.handler'

const stored = (overrides = {}) => ({
  id: 'jti-1',
  userId: 'u1',
  tokenHash: 'hash-old',
  expiresAt: new Date(Date.now() + 60_000),
  revokedAt: null,
  ...overrides,
})

describe('RefreshTokensHandler', () => {
  let handler: RefreshTokensHandler
  const userRepository = { findById: vi.fn() }
  const refreshTokenRepository = {
    findById: vi.fn(),
    revoke: vi.fn(),
    revokeAllForUser: vi.fn(),
    create: vi.fn(),
  }
  const tokenService = {
    verifyRefreshToken: vi.fn(),
    signAccessToken: vi.fn(),
    signRefreshToken: vi.fn(),
    hash: vi.fn(),
  }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RefreshTokensHandler,
        { provide: UserRepository, useValue: userRepository },
        { provide: RefreshTokenRepository, useValue: refreshTokenRepository },
        { provide: TokenService, useValue: tokenService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile()
    handler = moduleRef.get(RefreshTokensHandler)
    tokenService.verifyRefreshToken.mockResolvedValue({
      userId: 'u1',
      id: 'jti-1',
    })
    tokenService.hash.mockImplementation((token: string) =>
      token === 'old' ? 'hash-old' : 'hash-new',
    )
    tokenService.signAccessToken.mockResolvedValue({
      token: 'access-new',
      expiresIn: 900,
    })
    tokenService.signRefreshToken.mockResolvedValue({
      token: 'new',
      id: 'jti-2',
      expiresAt: new Date(),
    })
    userRepository.findById.mockResolvedValue({ id: 'u1' })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  const run = () =>
    handler.execute(new RefreshTokensCommand({ refreshToken: 'old' }))

  it('rotates: revokes the old token and issues a new pair', async () => {
    refreshTokenRepository.findById.mockResolvedValue(stored())
    refreshTokenRepository.revoke.mockResolvedValue(true)

    await expect(run()).resolves.toEqual({
      accessToken: 'access-new',
      refreshToken: 'new',
      expiresIn: 900,
    })
    expect(refreshTokenRepository.revoke).toHaveBeenCalledWith('jti-1')
    expect(refreshTokenRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'jti-2', tokenHash: 'hash-new' }),
    )
  })

  it('revokes every session when a revoked token is replayed', async () => {
    refreshTokenRepository.findById.mockResolvedValue(
      stored({ revokedAt: new Date() }),
    )
    refreshTokenRepository.revoke.mockResolvedValue(false)

    await expect(run()).rejects.toMatchObject({
      code: ErrorCode.INVALID_REFRESH_TOKEN,
    })
    expect(refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith('u1')
    expect(refreshTokenRepository.create).not.toHaveBeenCalled()
  })

  it.each([
    ['unknown token', null],
    ['hash mismatch', stored({ tokenHash: 'other' })],
    ['expired token', stored({ expiresAt: new Date(Date.now() - 1) })],
  ])('rejects %s without revoking anything', async (_name, record) => {
    refreshTokenRepository.findById.mockResolvedValue(record)

    await expect(run()).rejects.toMatchObject({
      code: ErrorCode.INVALID_REFRESH_TOKEN,
    })
    expect(refreshTokenRepository.revoke).not.toHaveBeenCalled()
  })

  it('rejects when the user no longer exists', async () => {
    refreshTokenRepository.findById.mockResolvedValue(stored())
    refreshTokenRepository.revoke.mockResolvedValue(true)
    userRepository.findById.mockResolvedValue(null)

    await expect(run()).rejects.toMatchObject({
      code: ErrorCode.INVALID_REFRESH_TOKEN,
    })
  })
})
