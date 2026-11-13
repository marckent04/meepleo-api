import { CommandHandler } from '@nestjs/cqrs'
import {
  GameRepository,
  PlayRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { BusinessRuleError, ErrorCode } from '@/shared/errors'
import {
  DEFAULT_SCORING_TEMPLATE,
  type Play,
  type ScoringTemplate,
} from '@/shared/types'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { CreatePlayCommand } from '../commands'
import {
  assertValidPlayerSides,
  assertValidScoringTemplate,
  computeSideResults,
} from '../compute-play-result'

@CommandHandler(CreatePlayCommand)
export class CreatePlayHandler extends AppCommandHandler<
  CreatePlayCommand,
  Play
> {
  constructor(
    private readonly gameRepository: GameRepository,
    private readonly playRepository: PlayRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', CreatePlayCommand.name)
    this.logger.setContext(CreatePlayHandler.name)
  }

  async handle(command: CreatePlayCommand): Promise<Play> {
    const { userId, gameId, language, players } = command
    const template = await this.resolveTemplate(command)
    const scoring: ScoringTemplate = command.sides
      ? { ...template, sides: command.sides }
      : template
    assertValidScoringTemplate(scoring)
    assertValidPlayerSides(
      scoring.sides,
      players.map(({ side }) => side),
    )
    if (players.filter(({ isCurrentUser }) => isCurrentUser).length > 1) {
      throw new BusinessRuleError(
        ErrorCode.INVALID_PLAY_PLAYERS,
        'Only one player can be the current user',
      )
    }

    const sideCount = new Set(players.map(({ side }) => side)).size
    const results = computeSideResults(scoring, sideCount, [])
    return this.playRepository.create(
      {
        ...(command.id ? { id: command.id } : {}),
        userId,
        gameId,
        playedAt: command.playedAt ?? new Date(),
        note: command.note,
        scoring,
        players: players.map(({ name, side, isCurrentUser }) => ({
          userId: isCurrentUser ? userId : null,
          playerId: null,
          color: null,
          shape: null,
          name,
          side,
          total: results[side].total,
          rank: results[side].rank,
          isWinner: false,
        })),
      },
      language,
    )
  }

  /** Template sent, otherwise the game's, otherwise the default one. */
  private async resolveTemplate({
    gameId,
    language,
    scoring,
  }: CreatePlayCommand): Promise<ScoringTemplate> {
    // Throws GAME_NOT_FOUND (404) if the game does not exist or is deleted.
    const gameTemplate = await this.gameRepository.findScoringTemplate(
      gameId,
      language,
    )
    return scoring?.toTemplate() ?? gameTemplate ?? DEFAULT_SCORING_TEMPLATE
  }
}
