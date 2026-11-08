import { CommandHandler } from '@nestjs/cqrs'
import { PasswordHasher, TokenService } from '@/infrastructure/adapters/auth'
import {
  RefreshTokenRepository,
  UserRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { ErrorCode, UnauthenticatedError } from '@/shared/errors'
import type { AuthTokens } from '@/shared/types'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { LoginCommand } from '../commands'
import { issueTokens } from './issue-tokens'

@CommandHandler(LoginCommand)
export class LoginHandler extends AppCommandHandler<LoginCommand, AuthTokens> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenService: TokenService,
    logger: LoggerService,
  ) {
    super(logger, 'user', LoginCommand.name)
    this.logger.setContext(LoginHandler.name)
  }

  async handle({ username, password }: LoginCommand): Promise<AuthTokens> {
    const user = await this.userRepository.findCredentialsByUsername(username)
    const valid = user
      ? await this.passwordHasher.verify(user.passwordHash, password)
      : await this.passwordHasher.verifyDummy(password).then(() => false)
    if (!user || !valid) {
      // Same error whether the account exists or not: no enumeration.
      throw new UnauthenticatedError('Invalid credentials', {
        code: ErrorCode.INVALID_CREDENTIALS,
      })
    }
    return issueTokens(this.tokenService, this.refreshTokenRepository, user.id)
  }
}
