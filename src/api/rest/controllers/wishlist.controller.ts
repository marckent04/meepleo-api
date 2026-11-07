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
  description: `Langue des contenus (${SUPPORTED_LOCALES.join(', ')}). Absente : 400 LANGUAGE_REQUIRED ; aucune langue supportée : 400 UNSUPPORTED_LANGUAGE.`,
})
@Controller({ path: 'wishlist', version: '1' })
export class WishlistController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get()
  @ApiOperation({
    summary: "Lister la liste de souhaits de l'utilisateur connecté",
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
    summary: 'Ajouter un jeu à la liste de souhaits',
    description:
      "Idempotent. Un jeu ne peut pas être à la fois dans la bibliothèque et dans la liste de souhaits : 409 CONFLICT s'il est déjà possédé.",
  })
  @ApiResponse({
    status: 204,
    description: 'Jeu présent dans la liste de souhaits',
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
    summary: 'Retirer un jeu de la liste de souhaits',
    description:
      'Idempotent : un jeu absent de la liste de souhaits est ignoré.',
  })
  @ApiResponse({
    status: 204,
    description: 'Jeu absent de la liste de souhaits',
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
