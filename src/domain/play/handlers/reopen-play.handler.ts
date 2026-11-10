import { CommandHandler } from '@nestjs/cqrs'
import { Transactional } from '@nestjs-cls/transactional'
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import { PlayRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import type { Play } from '@/shared/types'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { ReopenPlayCommand } from '../commands'

@CommandHandler(ReopenPlayCommand)
export class ReopenPlayHandler extends AppCommandHandler<
  ReopenPlayCommand,
  Play
> {
  constructor(
    private readonly playRepository: PlayRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', ReopenPlayCommand.name)
    this.logger.setContext(ReopenPlayHandler.name)
  }

  @Transactional<TransactionalAdapterPrisma>()
  async handle({ userId, playId, language }: ReopenPlayCommand): Promise<Play> {
    const play = await this.playRepository.findById(playId, userId, language)
    if (play.status === 'in_progress') return play
    await this.playRepository.reopen(playId)
    return this.playRepository.findById(playId, userId, language)
  }
}
