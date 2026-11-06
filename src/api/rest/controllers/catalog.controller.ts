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
  AddGameToCatalogCommand,
  ListCatalogQuery,
  RemoveGameFromCatalogCommand,
} from '@/domain/catalog'
import { type Locale, SUPPORTED_LOCALES } from '@/shared/i18n/locale'
import { CurrentUserId, Language } from '../../common/decorators'
import { CatalogGameIdParamDto, CatalogResponseDto } from '../dto'
import { ApiErrorResponses } from '../errors'

@ApiTags('catalog')
@ApiBearerAuth()
@ApiHeader({
  name: 'accept-language',
  required: true,
  description: `Langue des contenus (${SUPPORTED_LOCALES.join(', ')}). Absente : 400 LANGUAGE_REQUIRED ; aucune langue supportée : 400 UNSUPPORTED_LANGUAGE.`,
})
@Controller({ path: 'catalog', version: '1' })
export class CatalogController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get()
  @ApiOperation({
    summary: "Lister le catalogue de l'utilisateur connecté",
  })
  @ZodResponse({ status: 200, type: CatalogResponseDto })
  @ApiErrorResponses(400, 401, 500)
  async list(
    @CurrentUserId() userId: string,
    @Language() language: Locale,
  ): Promise<CatalogResponseDto> {
    const entries = await this.queryBus.execute(
      new ListCatalogQuery({ userId, language }),
    )
    return CatalogResponseDto.fromDomain(entries)
  }

  @Put('games/:gameId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Ajouter un jeu au catalogue',
    description: 'Idempotent : un jeu déjà présent reste dans le catalogue.',
  })
  @ApiResponse({ status: 204, description: 'Jeu présent dans le catalogue' })
  @ApiErrorResponses(400, 401, 404, 500)
  async add(
    @CurrentUserId() userId: string,
    @Param() params: CatalogGameIdParamDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new AddGameToCatalogCommand({ userId, gameId: params.gameId }),
    )
  }

  @Delete('games/:gameId')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Retirer un jeu du catalogue',
    description: 'Idempotent : un jeu absent du catalogue est ignoré.',
  })
  @ApiResponse({ status: 204, description: 'Jeu absent du catalogue' })
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
