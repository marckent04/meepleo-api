import { CommandHandler } from '@nestjs/cqrs'
import { TokenService } from '@/infrastructure/adapters/auth'
import { RefreshTokenRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { UnauthenticatedError } from '@/shared/errors'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { LogoutCommand } from '../commands'

@CommandHandler(LogoutCommand)
export class LogoutHandler extends AppCommandHandler<LogoutCommand, void> {
  constructor(
    private readonly refreshTokenRepository: RefreshTokenRepository,
    private readonly tokenService: TokenService,
    logger: LoggerService,
  ) {
    super(logger, 'user', LogoutCommand.name)
    this.logger.setContext(LogoutHandler.name)
  }

  async handle({ refreshToken }: LogoutCommand): Promise<void> {
    try {
      const { id } = await this.tokenService.verifyRefreshToken(refreshToken)
      await this.refreshTokenRepository.revoke(id)
    } catch (error) {
      // Idempotent: signing out with an already invalid token is a success.
      if (!(error instanceof UnauthenticatedError)) throw error
    }
  }
}
