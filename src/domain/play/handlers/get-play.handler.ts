import { QueryHandler } from '@nestjs/cqrs'
import { PlayRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import type { Play } from '@/shared/types'
import { AppQueryHandler } from '@/utils/cqrs.utils'
import { GetPlayQuery } from '../queries'

@QueryHandler(GetPlayQuery)
export class GetPlayHandler extends AppQueryHandler<GetPlayQuery, Play> {
  constructor(
    private readonly playRepository: PlayRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', GetPlayQuery.name)
    this.logger.setContext(GetPlayHandler.name)
  }

  handle({ userId, playId, language }: GetPlayQuery): Promise<Play> {
    return this.playRepository.findById(playId, userId, language)
  }
}
