import { CommandHandler } from '@nestjs/cqrs'
import { Transactional } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import { PlayRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import type { Play } from '@/shared/types'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { UpdatePlayCommand } from '../commands'

@CommandHandler(UpdatePlayCommand)
export class UpdatePlayHandler extends AppCommandHandler<
  UpdatePlayCommand,
  Play
> {
  constructor(
    private readonly playRepository: PlayRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', UpdatePlayCommand.name)
    this.logger.setContext(UpdatePlayHandler.name)
  }

  @Transactional<TransactionalAdapterPrisma>()
  async handle({
    userId,
    playId,
    language,
    playedAt,
    note,
  }: UpdatePlayCommand): Promise<Play> {
    // Throws PLAY_NOT_FOUND (404) unless the user owns the play.
    const play = await this.playRepository.findById(playId, userId, language)
    if (playedAt === undefined && note === undefined) return play
    await this.playRepository.updateDetails(playId, { playedAt, note })
    return this.playRepository.findById(playId, userId, language)
  }
}
