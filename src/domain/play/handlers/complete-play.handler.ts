import { CommandHandler } from '@nestjs/cqrs'
import { Transactional } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import { PlayRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { BusinessRuleError, ErrorCode } from '@/shared/errors'
import type { Play } from '@/shared/types'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { CompletePlayCommand } from '../commands'
import {
  assertValidWinnerSides,
  computeSideResults,
  computeWinnerSides,
  sideCountOf,
} from '../compute-play-result'

@CommandHandler(CompletePlayCommand)
export class CompletePlayHandler extends AppCommandHandler<
  CompletePlayCommand,
  Play
> {
  constructor(
    private readonly playRepository: PlayRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', CompletePlayCommand.name)
    this.logger.setContext(CompletePlayHandler.name)
  }

  @Transactional<TransactionalAdapterPrisma>()
  async handle({
    userId,
    playId,
    language,
    winnerSides,
  }: CompletePlayCommand): Promise<Play> {
    const play = await this.playRepository.findById(playId, userId, language)
    const sideCount = sideCountOf(play)
    const winners = winnerSides ?? this.computedWinners(play, sideCount)
    assertValidWinnerSides(sideCount, winners)
    await this.playRepository.complete(
      playId,
      play.completedAt ?? new Date(),
      winners,
    )
    return this.playRepository.findById(playId, userId, language)
  }

  /** Sides ranked first; a manual outcome needs the winners to be chosen. */
  private computedWinners(play: Play, sideCount: number): number[] {
    if (play.scoring.outcome === 'manual') {
      throw new BusinessRuleError(
        ErrorCode.INVALID_PLAY_WINNERS,
        'A manual outcome needs the winners to be chosen',
        { details: { playId: play.id } },
      )
    }
    return computeWinnerSides(
      computeSideResults(play.scoring, sideCount, play.scores),
    )
  }
}
