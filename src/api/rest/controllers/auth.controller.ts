import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { ZodResponse } from 'nestjs-zod'
import {
  GetCurrentUserQuery,
  LoginCommand,
  LogoutCommand,
  RefreshTokensCommand,
  RegisterUserCommand,
} from '@/domain/auth'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locale'
import { CurrentUserId, Public } from '../../common/decorators'
import {
  AuthTokensResponseDto,
  LoginBodyDto,
  RefreshTokenBodyDto,
  RegisterBodyDto,
  UserResponseDto,
} from '../dto'
import { ApiErrorResponses } from '../errors'

/** Limite stricte (par IP) sur les routes qui ouvrent ou prolongent une session. */
const AUTH_THROTTLE = { default: { ttl: 60_000, limit: 10 } }

@ApiTags('auth')
@ApiHeader({
  name: 'accept-language',
  required: true,
  description: `Langue des messages d'erreur (${SUPPORTED_LOCALES.join(', ')}).`,
})
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('register')
  @Public()
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({
    summary: 'Créer un compte',
    description:
      "Email, nom d'utilisateur et mot de passe. Le mot de passe est haché avec argon2id. Connectez-vous ensuite via `/auth/login`.",
  })
  @ZodResponse({ status: 201, type: UserResponseDto })
  @ApiErrorResponses(400, 409, 429, 500)
  async register(@Body() body: RegisterBodyDto): Promise<UserResponseDto> {
    const user = await this.commandBus.execute(new RegisterUserCommand(body))
    return UserResponseDto.fromDomain(user)
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({
    summary: "Se connecter avec un nom d'utilisateur et un mot de passe",
  })
  @ZodResponse({ status: 200, type: AuthTokensResponseDto })
  @ApiErrorResponses(400, 401, 429, 500)
  async login(@Body() body: LoginBodyDto): Promise<AuthTokensResponseDto> {
    const tokens = await this.commandBus.execute(new LoginCommand(body))
    return AuthTokensResponseDto.fromDomain(tokens)
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({
    summary: 'Renouveler les tokens',
    description:
      "Le refresh token est à usage unique (rotation) : l'ancien est révoqué. Présenter un refresh token déjà utilisé révoque toutes les sessions du compte.",
  })
  @ZodResponse({ status: 200, type: AuthTokensResponseDto })
  @ApiErrorResponses(400, 401, 429, 500)
  async refresh(
    @Body() body: RefreshTokenBodyDto,
  ): Promise<AuthTokensResponseDto> {
    const tokens = await this.commandBus.execute(new RefreshTokensCommand(body))
    return AuthTokensResponseDto.fromDomain(tokens)
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  @ApiOperation({
    summary: 'Se déconnecter',
    description: 'Révoque le refresh token. Idempotent.',
  })
  @ApiResponse({ status: 204, description: 'Refresh token révoqué' })
  @ApiErrorResponses(400, 500)
  async logout(@Body() body: RefreshTokenBodyDto): Promise<void> {
    await this.commandBus.execute(new LogoutCommand(body))
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Compte de l'utilisateur connecté" })
  @ZodResponse({ status: 200, type: UserResponseDto })
  @ApiErrorResponses(401, 500)
  async me(@CurrentUserId() userId: string): Promise<UserResponseDto> {
    const user = await this.queryBus.execute(
      new GetCurrentUserQuery({ userId }),
    )
    return UserResponseDto.fromDomain(user)
  }
}
