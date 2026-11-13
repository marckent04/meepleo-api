import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  Query,
} from '@nestjs/common'
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
  AddGameToCatalogCommand,
  ListCatalogQuery,
  RemoveGameFromCatalogCommand,
} from '@/domain/catalog'
import { type Locale, SUPPORTED_LOCALES } from '@/shared/i18n/locale'
import { CurrentUserId, Language } from '../../common/decorators'
import {
  CatalogGameIdParamDto,
  CatalogResponseDto,
  UpdatedSinceQueryDto,
} from '../dto'
import { ApiErrorResponses } from '../errors'

@ApiTags('catalog')
@ApiBearerAuth()
@ApiHeader({
  name: 'accept-language',
  required: true,
  description: `Content language (${SUPPORTED_LOCALES.join(', ')}). Missing: 400 LANGUAGE_REQUIRED; no supported language: 400 UNSUPPORTED_LANGUAGE.`,
})
@Controller({ path: 'catalog', version: '1' })
export class CatalogController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get()
  @ApiOperation({
    summary: "List the current user's catalog",
  })
  @ZodResponse({ status: 200, type: CatalogResponseDto })
  @ApiErrorResponses(400, 401, 500)
  async list(
    @CurrentUserId() userId: string,
    @Language() language: Locale,
    @Query() query: UpdatedSinceQueryDto,
  ): Promise<CatalogResponseDto> {
    const entries = await this.queryBus.execute(
      new ListCatalogQuery({
        userId,
        language,
        updatedSince: query.updatedSince ? new Date(query.updatedSince) : null,
      }),
    )
    return CatalogResponseDto.fromDomain(entries)
  }

  @Put('games/:gameId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Add a game to the catalog',
    description:
      'Idempotent: a game already in the catalog stays there. Also starts preparing the game sheet in the Accept-Language language in the background, so it is ready when the game is played.',
  })
  @ApiResponse({ status: 204, description: 'Game is in the catalog' })
  @ApiErrorResponses(400, 401, 404, 500)
  async add(
    @CurrentUserId() userId: string,
    @Language() language: Locale,
    @Param() params: CatalogGameIdParamDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new AddGameToCatalogCommand({
        userId,
        gameId: params.gameId,
        language,
      }),
    )
  }

  @Delete('games/:gameId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Remove a game from the catalog',
    description: 'Idempotent: a game not in the catalog is ignored.',
  })
  @ApiResponse({ status: 204, description: 'Game is not in the catalog' })
  @ApiErrorResponses(400, 401, 500)
  async remove(
    @CurrentUserId() userId: string,
    @Param() params: CatalogGameIdParamDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new RemoveGameFromCatalogCommand({ userId, gameId: params.gameId }),
    )
  }
}
