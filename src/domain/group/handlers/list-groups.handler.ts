import { QueryHandler } from '@nestjs/cqrs'
import { GroupRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import type { Group } from '@/shared/types'
import { AppQueryHandler } from '@/utils/cqrs.utils'
import { ListGroupsQuery } from '../queries'

@QueryHandler(ListGroupsQuery)
export class ListGroupsHandler extends AppQueryHandler<
  ListGroupsQuery,
  Group[]
> {
  constructor(
    private readonly groupRepository: GroupRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', ListGroupsQuery.name)
    this.logger.setContext(ListGroupsHandler.name)
  }

  handle({ userId, updatedSince }: ListGroupsQuery): Promise<Group[]> {
    return this.groupRepository.listByUser(userId, updatedSince ?? undefined)
  }
}
