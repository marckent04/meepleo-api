import { Command } from '@nestjs/cqrs'
import { IsString, MaxLength, MinLength } from 'class-validator'
import type { AuthTokens } from '@/shared/types'
import { PASSWORD_MAX_LENGTH, USERNAME_MAX_LENGTH } from '../auth.constants'

export type LoginCommandParams = {
  username: string
  password: string
}

/** Authenticates by username + password and issues a token pair. */
export class LoginCommand extends Command<AuthTokens> {
  @IsString()
  @MinLength(1)
  @MaxLength(USERNAME_MAX_LENGTH)
  readonly username: string

  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  readonly password: string

  constructor({ username, password }: LoginCommandParams) {
    super()
    this.username = username.trim().toLowerCase()
    this.password = password
  }
}
