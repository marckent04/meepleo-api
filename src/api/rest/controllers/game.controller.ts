import { Controller, Get, Param, Query, Res } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'
import { ZodResponse, ZodSerializerDto } from 'nestjs-zod'
import {
  AGGREGATION_POLL_INTERVAL_SECONDS,
  RequestGameSheetCommand,
  SearchGamesQuery,
} from '@/domain/game'
import { ErrorCode } from '@/shared/errors'
import { type Locale, SUPPORTED_LOCALES } from '@/shared/i18n/locale'
import { ErrorCodeOnFailure, Language } from '../../common/decorators'
import {
  GameIdParamDto,
  GameLookupResponseSchema,
  GamePendingResponseDto,
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
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

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
      "La fiche est rédigée dans la langue d'Accept-Language. À la première demande dans une langue, elle est générée par IA (ou traduite si elle existe déjà dans une autre langue) en tâche de fond : la route répond 202 jusqu'à ce qu'elle soit prête, et le client la rappelle après `retryAfterSeconds` (en-tête Retry-After). Si l'agrégation échoue, les appels suivants répondent 500 pendant quelques minutes, puis une nouvelle tentative est lancée.",
  })
  @ZodSerializerDto(GameLookupResponseSchema)
  @ApiResponse({ status: 200, type: GameResponseDto })
  @ApiResponse({ status: 202, type: GamePendingResponseDto.Output })
  @ApiErrorResponses(400, 404, 500)
  @ErrorCodeOnFailure(ErrorCode.GAME_SHEET_GENERATION_FAILED)
  async findOne(
    @Param() params: GameIdParamDto,
    @Language() language: Locale,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<GameResponseDto | GamePendingResponseDto> {
    // Commande et non query : la première demande lance l'agrégation.
    const availability = await this.commandBus.execute(
      new RequestGameSheetCommand({ gameId: params.id, language }),
    )
    if (availability.status === 'ready') {
      return GameResponseDto.fromDomain(availability.sheet)
    }
    reply
      .status(202)
      .header('Retry-After', String(AGGREGATION_POLL_INTERVAL_SECONDS))
    return GamePendingResponseDto.create(AGGREGATION_POLL_INTERVAL_SECONDS)
  }
}
