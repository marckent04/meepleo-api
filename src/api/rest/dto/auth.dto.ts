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
    .describe(
      'Email du compte (sert plus tard à la récupération du mot de passe)',
    )
    .meta({ example: 'ada@example.com' }),
  username: z
    .string()
    .trim()
    .min(USERNAME_MIN_LENGTH)
    .max(USERNAME_MAX_LENGTH)
    .regex(USERNAME_PATTERN)
    .describe("Nom d'utilisateur : lettres, chiffres et `_`, casse ignorée")
    .meta({ example: 'ada_lovelace' }),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH)
    .max(PASSWORD_MAX_LENGTH)
    .describe('Mot de passe')
    .meta({ example: 'correct horse battery staple' }),
})

export class RegisterBodyDto extends createZodDto(RegisterBodySchema) {}

export const LoginBodySchema = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(USERNAME_MAX_LENGTH)
    .describe("Nom d'utilisateur (casse ignorée)")
    .meta({ example: 'ada_lovelace' }),
  password: z
    .string()
    .min(1)
    .max(PASSWORD_MAX_LENGTH)
    .describe('Mot de passe')
    .meta({ example: 'correct horse battery staple' }),
})

export class LoginBodyDto extends createZodDto(LoginBodySchema) {}

export const RefreshTokenBodySchema = z.object({
  refreshToken: z.string().min(1).describe('Refresh token reçu au login'),
})

export class RefreshTokenBodyDto extends createZodDto(RefreshTokenBodySchema) {}

export const AuthTokensResponseSchema = z
  .object({
    accessToken: z
      .string()
      .describe('JWT court à envoyer en `Authorization: Bearer`'),
    refreshToken: z
      .string()
      .describe('JWT long, à échanger sur `/auth/refresh` (usage unique)'),
    expiresIn: z
      .number()
      .int()
      .positive()
      .describe("Durée de vie de l'access token, en secondes")
      .meta({ example: 900 }),
  })
  .describe("Paire de tokens d'authentification")

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
    id: z.uuid().describe("Identifiant de l'utilisateur"),
    email: z.string().describe('Email (en minuscules)'),
    username: z.string().describe("Nom d'utilisateur (en minuscules)"),
    createdAt: z.iso.datetime().describe('Date de création (ISO 8601, UTC)'),
  })
  .describe('Compte utilisateur')

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
    .describe('Nombre de jeux dans le catalogue (bibliothèque)'),
  wishlistCount: z
    .number()
    .int()
    .nonnegative()
    .describe('Nombre de jeux dans la liste de souhaits'),
  favoritesCount: z
    .number()
    .int()
    .nonnegative()
    .describe('Nombre de jeux favoris'),
}).describe("Compte de l'utilisateur connecté")

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
