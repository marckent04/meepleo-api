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
 * Crée un compte. L'email et le username sont normalisés (trim + minuscules) :
 * l'unicité et le login sont insensibles à la casse. Le mot de passe est haché
 * avec argon2 avant d'être stocké.
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
