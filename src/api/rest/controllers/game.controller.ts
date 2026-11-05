import { Controller, Get, Param, Query } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { GetGameQuery, SearchGamesQuery } from '@/domain/game'
import { ErrorCode } from '@/shared/errors'
import { type Locale, SUPPORTED_LOCALES } from '@/shared/i18n/locale'
import { ErrorCodeOnFailure, Language } from '../../common/decorators'
import {
  GameIdParamDto,
  GameResponseDto,
  GameSearchResponseDto,
  SearchGamesQueryDto,
} from '../dto'
import { ApiErrorResponses } from '../errors'

@ApiTags('games')
@ApiHeader({
  name: 'accept-language',
  required: true,
  description: `Langue des contenus (${SUPPORTED_LOCALES.join(', ')}). Absente : 400 LANGUAGE_REQUIRED ; aucune langue supportée : 400 UNSUPPORTED_LANGUAGE.`,
})
@Controller({ path: 'games', version: '1' })
export class GameController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({
    summary: 'Rechercher des jeux par nom (autocomplétion)',
    description:
      "Jeux dont le nom canonique ou le nom dans la langue d'Accept-Language contient `search`, casse et accents ignorés. Les noms commençant par `search` sont renvoyés en premier.",
  })
  @ZodResponse({ status: 200, type: GameSearchResponseDto })
  @ApiErrorResponses(400, 500)
  async search(
    @Query() query: SearchGamesQueryDto,
    @Language() language: Locale,
  ): Promise<GameSearchResponseDto> {
    const results = await this.queryBus.execute(
      new SearchGamesQuery({
        search: query.search,
        limit: query.limit,
        language,
      }),
    )
    return GameSearchResponseDto.fromDomain(results)
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Récupérer un jeu et sa fiche de règles',
    description:
      "La fiche est rédigée dans la langue d'Accept-Language. À la première demande dans une langue, elle est générée par IA (ou traduite si elle existe déjà dans une autre langue) : la réponse peut alors prendre plusieurs dizaines de secondes.",
  })
  @ZodResponse({ status: 200, type: GameResponseDto })
  @ApiErrorResponses(400, 404, 500)
  @ErrorCodeOnFailure(ErrorCode.GAME_SHEET_GENERATION_FAILED)
  async findOne(
    @Param() params: GameIdParamDto,
    @Language() language: Locale,
  ): Promise<GameResponseDto> {
    const sheet = await this.queryBus.execute(
      new GetGameQuery({ gameId: params.id, language }),
    )
    return GameResponseDto.fromDomain(sheet)
  }
}
