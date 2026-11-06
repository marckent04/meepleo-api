import { Command } from '@nestjs/cqrs'
import { IsString, MinLength } from 'class-validator'

/** Révoque un refresh token. Idempotent : un token invalide est ignoré. */
export class LogoutCommand extends Command<void> {
  @IsString()
  @MinLength(1)
  readonly refreshToken: string

  constructor({ refreshToken }: { refreshToken: string }) {
    super()
    this.refreshToken = refreshToken
  }
}
