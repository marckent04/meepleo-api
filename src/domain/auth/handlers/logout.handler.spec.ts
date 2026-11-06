import { Test } from '@nestjs/testing'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import { TokenService } from '@/infrastructure/adapters/auth'
import { RefreshTokenRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { UnauthenticatedError } from '@/shared/errors'
import { LogoutCommand } from '../commands'
import { LogoutHandler } from './logout.handler'

describe('LogoutHandler', () => {
  let handler: LogoutHandler
  const refreshTokenRepository = { revoke: vi.fn() }
  const tokenService = { verifyRefreshToken: vi.fn() }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        LogoutHandler,
        { provide: RefreshTokenRepository, useValue: refreshTokenRepository },
        { provide: TokenService, useValue: tokenService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile()
    handler = moduleRef.get(LogoutHandler)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('revokes the refresh token', async () => {
    tokenService.verifyRefreshToken.mockResolvedValue({
      userId: 'u1',
      id: 'jti-1',
    })

    await handler.execute(new LogoutCommand({ refreshToken: 'tok' }))

    expect(refreshTokenRepository.revoke).toHaveBeenCalledWith('jti-1')
  })

  it('succeeds silently on an invalid token', async () => {
    tokenService.verifyRefreshToken.mockRejectedValue(
      new UnauthenticatedError(),
    )

    await expect(
      handler.execute(new LogoutCommand({ refreshToken: 'bad' })),
    ).resolves.toBeUndefined()
    expect(refreshTokenRepository.revoke).not.toHaveBeenCalled()
  })
})
