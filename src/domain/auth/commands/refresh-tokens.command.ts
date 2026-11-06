import { Command } from '@nestjs/cqrs'
import { IsString, MinLength } from 'class-validator'
import type { AuthTokens } from '@/shared/types'

/**
 * Échange un refresh token contre une nouvelle paire de tokens (rotation :
 * l'ancien refresh token est révoqué). Présenter un token déjà révoqué révoque
 * toutes les sessions de l'utilisateur.
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
