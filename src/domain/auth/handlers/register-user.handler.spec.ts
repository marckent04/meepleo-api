import { Test } from '@nestjs/testing'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import { PasswordHasher } from '@/infrastructure/adapters/auth'
import { UserRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import {
  ConflictError,
  CQRSValidationException,
  ErrorCode,
} from '@/shared/errors'
import { RegisterUserCommand } from '../commands'
import { RegisterUserHandler } from './register-user.handler'

const user = {
  id: 'u1',
  email: 'ada@example.com',
  username: 'ada',
  createdAt: new Date(),
}

describe('RegisterUserHandler', () => {
  let handler: RegisterUserHandler
  const userRepository = {
    existsByEmail: vi.fn(),
    existsByUsername: vi.fn(),
    create: vi.fn(),
  }
  const passwordHasher = { hash: vi.fn() }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RegisterUserHandler,
        { provide: UserRepository, useValue: userRepository },
        { provide: PasswordHasher, useValue: passwordHasher },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile()
    handler = moduleRef.get(RegisterUserHandler)
    userRepository.existsByEmail.mockResolvedValue(false)
    userRepository.existsByUsername.mockResolvedValue(false)
    userRepository.create.mockResolvedValue(user)
    passwordHasher.hash.mockResolvedValue('hashed')
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  const command = (overrides = {}) =>
    new RegisterUserCommand({
      email: ' Ada@Example.com ',
      username: ' Ada ',
      password: 'correct-horse',
      ...overrides,
    })

  it('stores a normalized user with a hashed password', async () => {
    await expect(handler.execute(command())).resolves.toBe(user)

    expect(passwordHasher.hash).toHaveBeenCalledWith('correct-horse')
    expect(userRepository.create).toHaveBeenCalledWith({
      email: 'ada@example.com',
      username: 'ada',
      passwordHash: 'hashed',
    })
  })

  it('rejects an email already used', async () => {
    userRepository.existsByEmail.mockResolvedValue(true)

    await expect(handler.execute(command())).rejects.toMatchObject({
      code: ErrorCode.EMAIL_ALREADY_USED,
    })
    expect(userRepository.create).not.toHaveBeenCalled()
  })

  it('rejects a username already used', async () => {
    userRepository.existsByUsername.mockResolvedValue(true)

    const result = handler.execute(command())
    await expect(result).rejects.toBeInstanceOf(ConflictError)
    await expect(result).rejects.toMatchObject({
      code: ErrorCode.USERNAME_ALREADY_USED,
    })
  })

  it.each([
    ['invalid email', { email: 'nope' }],
    ['short username', { username: 'ab' }],
    ['username with spaces', { username: 'a b c' }],
    ['short password', { password: 'short' }],
  ])('rejects %s', async (_name, overrides) => {
    await expect(handler.execute(command(overrides))).rejects.toBeInstanceOf(
      CQRSValidationException,
    )
    expect(userRepository.create).not.toHaveBeenCalled()
  })
})
