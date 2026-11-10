import { CommandHandler } from '@nestjs/cqrs'
import { Transactional } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import { PlayRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { ConflictError, ErrorCode } from '@/shared/errors'
import type { Play, PlayScore } from '@/shared/types'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { SavePlayScoresCommand } from '../commands'
import {
  assertValidScores,
  computeSideResults,
  sideCountOf,
} from '../compute-play-result'

@CommandHandler(SavePlayScoresCommand)
export class SavePlayScoresHandler extends AppCommandHandler<
  SavePlayScoresCommand,
  Play
> {
  constructor(
    private readonly playRepository: PlayRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', SavePlayScoresCommand.name)
    this.logger.setContext(SavePlayScoresHandler.name)
  }

  @Transactional<TransactionalAdapterPrisma>()
  async handle({
    userId,
    playId,
    language,
    scores,
  }: SavePlayScoresCommand): Promise<Play> {
    const play = await this.playRepository.findById(playId, userId, language)
    if (play.status === 'completed') {
      throw new ConflictError('The play is completed', {
        code: ErrorCode.PLAY_ALREADY_COMPLETED,
        details: { playId },
      })
    }
    const cells: PlayScore[] = scores.map(({ side, rowKey, round, value }) => ({
      side,
      rowKey,
      round,
      value,
    }))
    const sideCount = sideCountOf(play)
    assertValidScores(play.scoring, sideCount, cells)
    await this.playRepository.replaceScores(
      playId,
      cells,
      computeSideResults(play.scoring, sideCount, cells),
    )
    return this.playRepository.findById(playId, userId, language)
  }
}
