import { Controller, Get, Headers, Param } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger'
import { ZodResponse } from 'nestjs-zod'
import { GetGameQuery } from '@/domain/game'
import { ErrorCode } from '@/shared/errors'
import { resolveLocale, SUPPORTED_LOCALES } from '@/shared/i18n/locale'
import { ErrorCodeOnFailure } from '../../common/decorators'
import { GameIdParamDto, GameResponseDto } from '../dto'
import { ApiErrorResponses } from '../errors'

@ApiTags('games')
@Controller({ path: 'games', version: '1' })
export class GameController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Récupérer un jeu et sa fiche de règles',
    description:
      "La fiche est rédigée dans la langue d'Accept-Language. À la première demande dans une langue, elle est générée par IA (ou traduite si elle existe déjà dans une autre langue) : la réponse peut alors prendre plusieurs dizaines de secondes.",
  })
  @ApiHeader({
    name: 'accept-language',
    required: false,
    description: `Langue de la fiche (${SUPPORTED_LOCALES.join(', ')}) ; fr par défaut`,
  })
  @ZodResponse({ status: 200, type: GameResponseDto })
  @ApiErrorResponses(400, 404, 500)
  @ErrorCodeOnFailure(ErrorCode.GAME_SHEET_GENERATION_FAILED)
  async findOne(
    @Param() params: GameIdParamDto,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<GameResponseDto> {
    const sheet = await this.queryBus.execute(
      new GetGameQuery({
        gameId: params.id,
        language: resolveLocale(acceptLanguage),
      }),
    )
    return GameResponseDto.fromDomain(sheet)
  }
}
