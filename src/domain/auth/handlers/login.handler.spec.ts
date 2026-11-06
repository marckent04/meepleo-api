import { Test } from '@nestjs/testing'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import { PasswordHasher, TokenService } from '@/infrastructure/adapters/auth'
import {
  RefreshTokenRepository,
  UserRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { ErrorCode } from '@/shared/errors'
import { LoginCommand } from '../commands'
import { LoginHandler } from './login.handler'

const credentials = {
  id: 'u1',
  email: 'ada@example.com',
  username: 'ada',
  createdAt: new Date(),
  passwordHash: 'hashed',
}
const expiresAt = new Date('2026-12-06T00:00:00Z')

describe('LoginHandler', () => {
  let handler: LoginHandler
  const userRepository = { findCredentialsByUsername: vi.fn() }
  const refreshTokenRepository = { create: vi.fn() }
  const passwordHasher = { verify: vi.fn(), verifyDummy: vi.fn() }
  const tokenService = {
    signAccessToken: vi.fn(),
    signRefreshToken: vi.fn(),
    hash: vi.fn(),
  }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        LoginHandler,
        { provide: UserRepository, useValue: userRepository },
        { provide: RefreshTokenRepository, useValue: refreshTokenRepository },
        { provide: PasswordHasher, useValue: passwordHasher },
        { provide: TokenService, useValue: tokenService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile()
    handler = moduleRef.get(LoginHandler)
    tokenService.signAccessToken.mockResolvedValue({
      token: 'access',
      expiresIn: 900,
    })
    tokenService.signRefreshToken.mockResolvedValue({
      token: 'refresh',
      id: 'jti-1',
      expiresAt,
    })
    tokenService.hash.mockReturnValue('refresh-hash')
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  const command = () => new LoginCommand({ username: ' Ada ', password: 'pw' })

  it('issues tokens and stores only the refresh token hash', async () => {
    userRepository.findCredentialsByUsername.mockResolvedValue(credentials)
    passwordHasher.verify.mockResolvedValue(true)

    await expect(handler.execute(command())).resolves.toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresIn: 900,
    })

    expect(userRepository.findCredentialsByUsername).toHaveBeenCalledWith('ada')
    expect(refreshTokenRepository.create).toHaveBeenCalledWith({
      id: 'jti-1',
      userId: 'u1',
      tokenHash: 'refresh-hash',
      expiresAt,
    })
  })

  it('rejects a wrong password with INVALID_CREDENTIALS', async () => {
    userRepository.findCredentialsByUsername.mockResolvedValue(credentials)
    passwordHasher.verify.mockResolvedValue(false)

    await expect(handler.execute(command())).rejects.toMatchObject({
      code: ErrorCode.INVALID_CREDENTIALS,
    })
    expect(refreshTokenRepository.create).not.toHaveBeenCalled()
  })

  it('rejects an unknown user with the same error, after a dummy verify', async () => {
    userRepository.findCredentialsByUsername.mockResolvedValue(null)
    passwordHasher.verifyDummy.mockResolvedValue(undefined)

    await expect(handler.execute(command())).rejects.toMatchObject({
      code: ErrorCode.INVALID_CREDENTIALS,
    })
    expect(passwordHasher.verifyDummy).toHaveBeenCalledWith('pw')
    expect(passwordHasher.verify).not.toHaveBeenCalled()
  })
})
