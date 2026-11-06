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
  AddGameToFavoritesCommand,
  ListFavoritesQuery,
  RemoveGameFromFavoritesCommand,
} from '@/domain/favorites'
import { type Locale, SUPPORTED_LOCALES } from '@/shared/i18n/locale'
import { CurrentUserId, Language } from '../../common/decorators'
import { FavoriteGameIdParamDto, FavoritesResponseDto } from '../dto'
import { ApiErrorResponses } from '../errors'

@ApiTags('favorites')
@ApiBearerAuth()
@ApiHeader({
  name: 'accept-language',
  required: true,
  description: `Content language (${SUPPORTED_LOCALES.join(', ')}). Missing: 400 LANGUAGE_REQUIRED; no supported language: 400 UNSUPPORTED_LANGUAGE.`,
})
@Controller({ path: 'favorites', version: '1' })
export class FavoritesController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List the current user's favorites",
  })
  @ZodResponse({ status: 200, type: FavoritesResponseDto })
  @ApiErrorResponses(400, 401, 500)
  async list(
    @CurrentUserId() userId: string,
    @Language() language: Locale,
  ): Promise<FavoritesResponseDto> {
    const entries = await this.queryBus.execute(
      new ListFavoritesQuery({ userId, language }),
    )
    return FavoritesResponseDto.fromDomain(entries)
  }

  @Put('games/:gameId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Add a game to favorites',
    description: 'Idempotent: a game already in favorites stays there.',
  })
  @ApiResponse({ status: 204, description: 'Game is in favorites' })
  @ApiErrorResponses(400, 401, 404, 500)
  async add(
    @CurrentUserId() userId: string,
    @Param() params: FavoriteGameIdParamDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new AddGameToFavoritesCommand({ userId, gameId: params.gameId }),
    )
  }

  @Delete('games/:gameId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Remove a game from favorites',
    description: 'Idempotent: a game not in favorites is ignored.',
  })
  @ApiResponse({ status: 204, description: 'Game is not in favorites' })
  @ApiErrorResponses(400, 401, 500)
  async remove(
    @CurrentUserId() userId: string,
    @Param() params: FavoriteGameIdParamDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new RemoveGameFromFavoritesCommand({ userId, gameId: params.gameId }),
    )
  }
}
