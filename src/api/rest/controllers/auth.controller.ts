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
  CurrentUserResponseDto,
  LoginBodyDto,
  RefreshTokenBodyDto,
  RegisterBodyDto,
  UserResponseDto,
} from '../dto'
import { ApiErrorResponses } from '../errors'

/** Strict limit (per IP) on routes that open or extend a session. */
const AUTH_THROTTLE = { default: { ttl: 60_000, limit: 10 } }

@ApiTags('auth')
@ApiHeader({
  name: 'accept-language',
  required: true,
  description: `Language of error messages (${SUPPORTED_LOCALES.join(', ')}).`,
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
    summary: 'Create an account',
    description:
      'Email, username and password. The password is hashed with argon2id. Then sign in via `/auth/login`.',
  })
  @ZodResponse({ status: 201, type: UserResponseDto })
  @ApiErrorResponses(400, 409, 422, 429, 500)
  async register(@Body() body: RegisterBodyDto): Promise<UserResponseDto> {
    const user = await this.commandBus.execute(new RegisterUserCommand(body))
    return UserResponseDto.fromDomain(user)
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  @Throttle(AUTH_THROTTLE)
  @ApiOperation({
    summary: 'Sign in with a username and a password',
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
    summary: 'Renew the tokens',
    description:
      "The refresh token is single-use (rotation): the previous one is revoked. Presenting an already used refresh token revokes all the account's sessions.",
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
    summary: 'Sign out',
    description: 'Revokes the refresh token. Idempotent.',
  })
  @ApiResponse({ status: 204, description: 'Refresh token revoked' })
  @ApiErrorResponses(400, 500)
  async logout(@Body() body: RefreshTokenBodyDto): Promise<void> {
    await this.commandBus.execute(new LogoutCommand(body))
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Current user's account" })
  @ZodResponse({ status: 200, type: CurrentUserResponseDto })
  @ApiErrorResponses(401, 500)
  async me(@CurrentUserId() userId: string): Promise<CurrentUserResponseDto> {
    const user = await this.queryBus.execute(
      new GetCurrentUserQuery({ userId }),
    )
    return CurrentUserResponseDto.fromDomain(user)
  }
}
