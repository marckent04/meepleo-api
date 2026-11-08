import { CommandHandler } from '@nestjs/cqrs'
import { TokenService } from '@/infrastructure/adapters/auth'
import {
  RefreshTokenRepository,
  UserRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { ErrorCode, UnauthenticatedError } from '@/shared/errors'
import type { AuthTokens } from '@/shared/types'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { RefreshTokensCommand } from '../commands'
import { issueTokens } from './issue-tokens'

function invalidRefreshToken(message: string): UnauthenticatedError {
  return new UnauthenticatedError(message, {
    code: ErrorCode.INVALID_REFRESH_TOKEN,
  })
}

// Deliberately not @Transactional: revoking all sessions on replay
// must be committed even if the error is thrown afterwards.
@CommandHandler(RefreshTokensCommand)
export class RefreshTokensHandler extends AppCommandHandler<
  RefreshTokensCommand,
  AuthTokens
> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly tokenService: TokenService,
    logger: LoggerService,
  ) {
    super(logger, 'user', RefreshTokensCommand.name)
    this.logger.setContext(RefreshTokensHandler.name)
  }

  async handle({ refreshToken }: RefreshTokensCommand): Promise<AuthTokens> {
    const { userId, id } =
      await this.tokenService.verifyRefreshToken(refreshToken)

    const stored = await this.refreshTokenRepository.findById(id)
    if (
      !stored ||
      stored.userId !== userId ||
      stored.tokenHash !== this.tokenService.hash(refreshToken) ||
      stored.expiresAt <= new Date()
    ) {
      throw invalidRefreshToken('Unknown or expired refresh token')
    }

    // Atomic revocation: only one concurrent call can consume the token.
    const consumed = await this.refreshTokenRepository.revoke(id)
    if (!consumed) {
      this.logger.warn(
        `Refresh token reuse detected, revoking all sessions of ${userId}`,
      )
      await this.refreshTokenRepository.revokeAllForUser(userId)
      throw invalidRefreshToken('Refresh token already used')
    }

    if (!(await this.userRepository.findById(userId))) {
      throw invalidRefreshToken('User no longer exists')
    }
    return issueTokens(this.tokenService, this.refreshTokenRepository, userId)
  }
}
