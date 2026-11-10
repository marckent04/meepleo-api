import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
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
  CompletePlayCommand,
  CreatePlayCommand,
  DeletePlayCommand,
  GetPlayQuery,
  ListPlaysQuery,
  ReopenPlayCommand,
  SavePlayScoresCommand,
  UpdatePlayCommand,
} from '@/domain/play'
import { type Locale, SUPPORTED_LOCALES } from '@/shared/i18n/locale'
import { CurrentUserId, Language } from '../../common/decorators'
import {
  CompletePlayBodyDto,
  CreatePlayBodyDto,
  ListPlaysQueryDto,
  PlayIdParamDto,
  PlayResponseDto,
  PlaysResponseDto,
  SavePlayScoresBodyDto,
  UpdatePlayBodyDto,
} from '../dto'
import { ApiErrorResponses } from '../errors'

@ApiTags('plays')
@ApiBearerAuth()
@ApiHeader({
  name: 'accept-language',
  required: true,
  description: `Content language (${SUPPORTED_LOCALES.join(', ')}). Missing: 400 LANGUAGE_REQUIRED; no supported language: 400 UNSUPPORTED_LANGUAGE.`,
})
@Controller({ path: 'plays', version: '1' })
export class PlayController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Start recording a play',
    description:
      'Creates a play in progress with a copy of the game score sheet template (GET /games/:id/scoring), or of the adapted one sent in `scoring`. Players are placed in the columns given by `side`. 422 INVALID_PLAY_PLAYERS when the sides do not match the template, 422 INVALID_SCORING_TEMPLATE for an inconsistent template.',
  })
  @ZodResponse({ status: 201, type: PlayResponseDto })
  @ApiErrorResponses(400, 401, 404, 422, 500)
  async create(
    @CurrentUserId() userId: string,
    @Language() language: Locale,
    @Body() body: CreatePlayBodyDto,
  ): Promise<PlayResponseDto> {
    const play = await this.commandBus.execute(
      new CreatePlayCommand({
        userId,
        gameId: body.gameId,
        language,
        playedAt: body.playedAt ? new Date(body.playedAt) : null,
        note: body.note || null,
        players: body.players,
        scoring: body.scoring ?? null,
        sides: body.sides ?? null,
      }),
    )
    return PlayResponseDto.fromDomain(play)
  }

  @Get()
  @ApiOperation({ summary: "List the current user's plays" })
  @ZodResponse({ status: 200, type: PlaysResponseDto })
  @ApiErrorResponses(400, 401, 500)
  async list(
    @CurrentUserId() userId: string,
    @Language() language: Locale,
    @Query() query: ListPlaysQueryDto,
  ): Promise<PlaysResponseDto> {
    const plays = await this.queryBus.execute(
      new ListPlaysQuery({
        userId,
        language,
        gameId: query.gameId ?? null,
        limit: query.limit,
      }),
    )
    return PlaysResponseDto.fromDomain(plays)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a play and its score sheet' })
  @ZodResponse({ status: 200, type: PlayResponseDto })
  @ApiErrorResponses(400, 401, 404, 500)
  async findOne(
    @CurrentUserId() userId: string,
    @Language() language: Locale,
    @Param() params: PlayIdParamDto,
  ): Promise<PlayResponseDto> {
    const play = await this.queryBus.execute(
      new GetPlayQuery({ userId, playId: params.id, language }),
    )
    return PlayResponseDto.fromDomain(play)
  }

  @Put(':id/scores')
  @ApiOperation({
    summary: 'Save the score sheet of a play',
    description:
      'Replaces all the cells and recomputes the totals and ranks of the players. 409 PLAY_ALREADY_COMPLETED on a completed play (reopen it first), 422 INVALID_PLAY_SCORES when a cell does not match the score sheet.',
  })
  @ZodResponse({ status: 200, type: PlayResponseDto })
  @ApiErrorResponses(400, 401, 404, 409, 422, 500)
  async saveScores(
    @CurrentUserId() userId: string,
    @Language() language: Locale,
    @Param() params: PlayIdParamDto,
    @Body() body: SavePlayScoresBodyDto,
  ): Promise<PlayResponseDto> {
    const play = await this.commandBus.execute(
      new SavePlayScoresCommand({
        userId,
        playId: params.id,
        language,
        scores: body.scores,
      }),
    )
    return PlayResponseDto.fromDomain(play)
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Change the date or the note of a play',
    description: 'Fields left out are unchanged.',
  })
  @ZodResponse({ status: 200, type: PlayResponseDto })
  @ApiErrorResponses(400, 401, 404, 500)
  async update(
    @CurrentUserId() userId: string,
    @Language() language: Locale,
    @Param() params: PlayIdParamDto,
    @Body() body: UpdatePlayBodyDto,
  ): Promise<PlayResponseDto> {
    const play = await this.commandBus.execute(
      new UpdatePlayCommand({
        userId,
        playId: params.id,
        language,
        playedAt: body.playedAt ? new Date(body.playedAt) : undefined,
        note: body.note === undefined ? undefined : body.note || null,
      }),
    )
    return PlayResponseDto.fromDomain(play)
  }

  @Post(':id/complete')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Complete a play',
    description:
      'Ends the play and designates its winners: the sides ranked first, or `winnerSides`. A `manual` outcome requires `winnerSides` (422 INVALID_PLAY_WINNERS otherwise). Completing again changes the winners.',
  })
  @ZodResponse({ status: 200, type: PlayResponseDto })
  @ApiErrorResponses(400, 401, 404, 422, 500)
  async complete(
    @CurrentUserId() userId: string,
    @Language() language: Locale,
    @Param() params: PlayIdParamDto,
    @Body() body: CompletePlayBodyDto,
  ): Promise<PlayResponseDto> {
    const play = await this.commandBus.execute(
      new CompletePlayCommand({
        userId,
        playId: params.id,
        language,
        winnerSides: body.winnerSides ?? null,
      }),
    )
    return PlayResponseDto.fromDomain(play)
  }

  @Post(':id/reopen')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reopen a completed play',
    description:
      'Puts the play back in progress, without winners, so that its scores can be corrected. Idempotent.',
  })
  @ZodResponse({ status: 200, type: PlayResponseDto })
  @ApiErrorResponses(400, 401, 404, 500)
  async reopen(
    @CurrentUserId() userId: string,
    @Language() language: Locale,
    @Param() params: PlayIdParamDto,
  ): Promise<PlayResponseDto> {
    const play = await this.commandBus.execute(
      new ReopenPlayCommand({ userId, playId: params.id, language }),
    )
    return PlayResponseDto.fromDomain(play)
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete a play',
    description: 'Idempotent: a missing play is ignored.',
  })
  @ApiResponse({ status: 204, description: 'Play is deleted' })
  @ApiErrorResponses(400, 401, 500)
  async remove(
    @CurrentUserId() userId: string,
    @Param() params: PlayIdParamDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new DeletePlayCommand({ userId, playId: params.id }),
    )
  }
}
