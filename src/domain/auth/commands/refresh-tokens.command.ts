import { Command } from '@nestjs/cqrs'
import { IsString, MinLength } from 'class-validator'
import type { AuthTokens } from '@/shared/types'

/**
 * Exchanges a refresh token for a new token pair (rotation: the previous
 * refresh token is revoked). Presenting an already revoked token revokes all
 * the user's sessions.
 */
export class RefreshTokensCommand extends Command<AuthTokens> {
  @IsString()
  @MinLength(1)
  readonly refreshToken: string

  constructor({ refreshToken }: { refreshToken: string }) {
    super()
    this.refreshToken = refreshToken
  }
}
