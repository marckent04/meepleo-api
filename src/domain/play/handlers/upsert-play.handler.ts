import { CommandHandler } from '@nestjs/cqrs'
import { Transactional } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import {
  GameRepository,
  PlayerRepository,
  PlayRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { BusinessRuleError, ErrorCode } from '@/shared/errors'
import type { LwwResult, Play } from '@/shared/types'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { clampFutureDate } from '@/utils/last-write-wins'
import { UpsertPlayCommand } from '../commands'
import {
  assertValidPlayerSides,
  assertValidScores,
  assertValidScoringTemplate,
  assertValidWinnerSides,
  computeSideResults,
  computeWinnerSides,
} from '../compute-play-result'

@CommandHandler(UpsertPlayCommand)
export class UpsertPlayHandler extends AppCommandHandler<
  UpsertPlayCommand,
  LwwResult<Play | null>
> {
  constructor(
    private readonly gameRepository: GameRepository,
    private readonly playerRepository: PlayerRepository,
    private readonly playRepository: PlayRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', UpsertPlayCommand.name)
    this.logger.setContext(UpsertPlayHandler.name)
  }

  @Transactional<TransactionalAdapterPrisma>()
  async handle(command: UpsertPlayCommand): Promise<LwwResult<Play | null>> {
    const updatedAt = clampFutureDate(command.updatedAt)
    if (command.deletedAt !== null) {
      return this.playRepository.upsertLww(
        command.userId,
        { id: command.id, updatedAt, deletedAt: command.deletedAt },
        command.language,
      )
    }
    const write = await this.buildWrite(command, updatedAt)
    return this.playRepository.upsertLww(
      command.userId,
      write,
      command.language,
    )
  }

  /** Validates the play and derives totals, ranks and winners. */
  private async buildWrite(command: UpsertPlayCommand, updatedAt: Date) {
    const { userId, players, scores } = command
    // Throws GAME_NOT_FOUND (404) if the game does not exist or is deleted.
    await this.gameRepository.findById(command.gameId)
    const scoring = (
      command.scoring as NonNullable<typeof command.scoring>
    ).toTemplate()
    assertValidScoringTemplate(scoring)
    assertValidPlayerSides(
      scoring.sides,
      players.map(({ side }) => side),
    )
    const invalidPlayers = (reason: string) =>
      new BusinessRuleError(ErrorCode.INVALID_PLAY_PLAYERS, reason, {
        details: { reason },
      })
    if (players.filter(({ isCurrentUser }) => isCurrentUser).length > 1) {
      throw invalidPlayers('Only one player can be the current user')
    }
    const playerIds = players.map(({ playerId }) => playerId)
    if (new Set(playerIds).size !== playerIds.length) {
      throw invalidPlayers('A player cannot appear twice in a play')
    }
    const known = await this.playerRepository.findOwnedIds(userId, playerIds)
    if (playerIds.some((id) => !known.has(id))) {
      throw invalidPlayers('Players must belong to the user')
    }
    if (command.firstPlayerId && !playerIds.includes(command.firstPlayerId)) {
      throw invalidPlayers('The first player must be a player of the play')
    }

    const sideCount = new Set(players.map(({ side }) => side)).size
    const plainScores = scores.map(({ side, rowKey, round, value }) => ({
      side,
      rowKey,
      round,
      value,
    }))
    assertValidScores(scoring, sideCount, plainScores)
    const results = computeSideResults(scoring, sideCount, plainScores)
    const completed = command.status === 'completed'
    const winners = this.winnersOf(command, results, scoring.outcome, sideCount)

    return {
      id: command.id,
      createdAt: command.createdAt,
      updatedAt,
      deletedAt: null,
      gameId: command.gameId,
      status: command.status,
      playedAt: command.playedAt,
      startedAt: command.startedAt,
      endedAt: command.endedAt,
      completedAt: completed ? (command.endedAt ?? updatedAt) : null,
      durationSeconds: command.durationSeconds,
      firstPlayerId: command.firstPlayerId,
      note: command.note,
      scoring,
      players: players.map((player) => ({
        userId: player.isCurrentUser ? userId : null,
        playerId: player.playerId,
        name: player.name,
        color: player.color,
        shape: player.shape,
        side: player.side,
        total: results[player.side].total,
        rank: results[player.side].rank,
        isWinner: winners.includes(player.side),
      })),
      scores: plainScores,
    }
  }

  private winnersOf(
    command: UpsertPlayCommand,
    results: ReturnType<typeof computeSideResults>,
    outcome: string,
    sideCount: number,
  ): number[] {
    if (command.status !== 'completed') return []
    if (command.winnerSides !== null) {
      assertValidWinnerSides(sideCount, command.winnerSides)
      return command.winnerSides
    }
    if (outcome === 'manual') {
      throw new BusinessRuleError(
        ErrorCode.INVALID_PLAY_WINNERS,
        'A manual outcome needs the winners to be chosen',
      )
    }
    return computeWinnerSides(results)
  }
}
