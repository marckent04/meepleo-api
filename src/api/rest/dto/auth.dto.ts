import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@/domain/auth/auth.constants'
import type { AuthTokens, CurrentUser, User } from '@/shared/types'

export const RegisterBodySchema = z.object({
  email: z
    .email()
    .max(EMAIL_MAX_LENGTH)
    .describe('Account email (used later for password recovery)')
    .meta({ example: 'ada@example.com' }),
  username: z
    .string()
    .trim()
    .min(USERNAME_MIN_LENGTH)
    .max(USERNAME_MAX_LENGTH)
    .regex(USERNAME_PATTERN)
    .describe('Username: letters, digits and `_`, case-insensitive')
    .meta({ example: 'ada_lovelace' }),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH)
    .max(PASSWORD_MAX_LENGTH)
    .describe('Password')
    .meta({ example: 'correct horse battery staple' }),
})

export class RegisterBodyDto extends createZodDto(RegisterBodySchema) {}

export const LoginBodySchema = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(USERNAME_MAX_LENGTH)
    .describe('Username (case-insensitive)')
    .meta({ example: 'ada_lovelace' }),
  password: z
    .string()
    .min(1)
    .max(PASSWORD_MAX_LENGTH)
    .describe('Password')
    .meta({ example: 'correct horse battery staple' }),
})

export class LoginBodyDto extends createZodDto(LoginBodySchema) {}

export const RefreshTokenBodySchema = z.object({
  refreshToken: z.string().min(1).describe('Refresh token received at login'),
})

export class RefreshTokenBodyDto extends createZodDto(RefreshTokenBodySchema) {}

export const AuthTokensResponseSchema = z
  .object({
    accessToken: z
      .string()
      .describe('Short-lived JWT to send as `Authorization: Bearer`'),
    refreshToken: z
      .string()
      .describe('Long-lived JWT, to exchange on `/auth/refresh` (single use)'),
    expiresIn: z
      .number()
      .int()
      .positive()
      .describe('Access token lifetime, in seconds')
      .meta({ example: 900 }),
  })
  .describe('Authentication token pair')

export class AuthTokensResponseDto extends createZodDto(
  AuthTokensResponseSchema,
  { codec: true },
) {
  static fromDomain(tokens: AuthTokens): AuthTokensResponseDto {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    }
  }
}

export const UserResponseSchema = z
  .object({
    id: z.uuid().describe('User identifier'),
    email: z.string().describe('Email (lowercase)'),
    username: z.string().describe('Username (lowercase)'),
    createdAt: z.iso.datetime().describe('Creation date (ISO 8601, UTC)'),
  })
  .describe('User account')

export class UserResponseDto extends createZodDto(UserResponseSchema, {
  codec: true,
}) {
  static fromDomain(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      createdAt: user.createdAt.toISOString(),
    }
  }
}

export const CurrentUserResponseSchema = UserResponseSchema.extend({
  catalogCount: z
    .number()
    .int()
    .nonnegative()
    .describe('Number of games in the catalog (library)'),
  wishlistCount: z
    .number()
    .int()
    .nonnegative()
    .describe('Number of games in the wishlist'),
  favoritesCount: z
    .number()
    .int()
    .nonnegative()
    .describe('Number of favorite games'),
}).describe("Current user's account")

export class CurrentUserResponseDto extends createZodDto(
  CurrentUserResponseSchema,
  { codec: true },
) {
  static fromDomain(user: CurrentUser): CurrentUserResponseDto {
    return {
      ...UserResponseDto.fromDomain(user),
      catalogCount: user.catalogCount,
      wishlistCount: user.wishlistCount,
      favoritesCount: user.favoritesCount,
    }
  }
}
