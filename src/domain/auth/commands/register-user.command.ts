import { Command } from '@nestjs/cqrs'
import { IsEmail, Matches, MaxLength, MinLength } from 'class-validator'
import type { User } from '@/shared/types'
import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '../auth.constants'

export type RegisterUserCommandParams = {
  email: string
  username: string
  password: string
}

/**
 * Creates an account. The email and username are normalized (trim + lowercase):
 * uniqueness and login are case-insensitive. The password is hashed
 * with argon2 before being stored.
 */
export class RegisterUserCommand extends Command<User> {
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  readonly email: string

  @Matches(USERNAME_PATTERN)
  @MinLength(USERNAME_MIN_LENGTH)
  @MaxLength(USERNAME_MAX_LENGTH)
  readonly username: string

  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  readonly password: string

  constructor({ email, username, password }: RegisterUserCommandParams) {
    super()
    this.email = email.trim().toLowerCase()
    this.username = username.trim().toLowerCase()
    this.password = password
  }
}
