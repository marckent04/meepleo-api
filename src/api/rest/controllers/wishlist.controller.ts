import { Controller, Delete, Get, HttpCode, Param, Put } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import {
  AddGameToWishlistCommand,
  ListWishlistQuery,
  RemoveGameFromWishlistCommand,
} from '@/domain/wishlist'
import { type Locale, SUPPORTED_LOCALES } from '@/shared/i18n/locale'
import { CurrentUserId, Language } from '../../common/decorators'
import { WishlistGameIdParamDto, WishlistResponseDto } from '../dto'
import { ApiErrorResponses } from '../errors'

@ApiTags('wishlist')
@ApiBearerAuth()
@ApiHeader({
  name: 'accept-language',
  required: true,
  description: `Content language (${SUPPORTED_LOCALES.join(', ')}). Missing: 400 LANGUAGE_REQUIRED; no supported language: 400 UNSUPPORTED_LANGUAGE.`,
})
@Controller({ path: 'wishlist', version: '1' })
export class WishlistController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List the current user's wishlist",
  })
  @ZodResponse({ status: 200, type: WishlistResponseDto })
  @ApiErrorResponses(400, 401, 500)
  async list(
    @CurrentUserId() userId: string,
    @Language() language: Locale,
  ): Promise<WishlistResponseDto> {
    const entries = await this.queryBus.execute(
      new ListWishlistQuery({ userId, language }),
    )
    return WishlistResponseDto.fromDomain(entries)
  }

  @Put('games/:gameId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Add a game to the wishlist',
    description:
      'Idempotent. A game cannot be both in the library and in the wishlist: 409 CONFLICT if it is already owned.',
  })
  @ApiResponse({
    status: 204,
    description: 'Game is in the wishlist',
  })
  @ApiErrorResponses(400, 401, 404, 409, 500)
  async add(
    @CurrentUserId() userId: string,
    @Param() params: WishlistGameIdParamDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new AddGameToWishlistCommand({ userId, gameId: params.gameId }),
    )
  }

  @Delete('games/:gameId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Remove a game from the wishlist',
    description: 'Idempotent: a game not in the wishlist is ignored.',
  })
  @ApiResponse({
    status: 204,
    description: 'Game is not in the wishlist',
  })
  @ApiErrorResponses(400, 401, 500)
  async remove(
    @CurrentUserId() userId: string,
    @Param() params: WishlistGameIdParamDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new RemoveGameFromWishlistCommand({ userId, gameId: params.gameId }),
    )
  }
}
