import { Command } from '@nestjs/cqrs'
import { IsString, MinLength } from 'class-validator'

/** Revokes a refresh token. Idempotent: an invalid token is ignored. */
export class LogoutCommand extends Command<void> {
  @IsString()
  @MinLength(1)
  readonly refreshToken: string

  constructor({ refreshToken }: { refreshToken: string }) {
    super()
    this.refreshToken = refreshToken
  }
}
