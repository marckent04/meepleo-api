import { CommandHandler } from '@nestjs/cqrs'
import {
  GroupRepository,
  PlayerRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { BusinessRuleError, ErrorCode } from '@/shared/errors'
import type { Group, LwwResult } from '@/shared/types'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { clampFutureDate } from '@/utils/last-write-wins'
import { UpsertGroupCommand } from '../commands'

@CommandHandler(UpsertGroupCommand)
export class UpsertGroupHandler extends AppCommandHandler<
  UpsertGroupCommand,
  LwwResult<Group>
> {
  constructor(
    private readonly groupRepository: GroupRepository,
    private readonly playerRepository: PlayerRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', UpsertGroupCommand.name)
    this.logger.setContext(UpsertGroupHandler.name)
  }

  async handle(command: UpsertGroupCommand): Promise<LwwResult<Group>> {
    // A tombstone does not carry (nor need) valid members.
    if (command.deletedAt === null) {
      if (command.memberIds.length === 0) {
        throw new BusinessRuleError(
          ErrorCode.INVALID_GROUP_MEMBERS,
          'A group needs at least one member',
        )
      }
      const liveIds = await this.playerRepository.findLiveIds(
        command.userId,
        command.memberIds,
      )
      const unknown = command.memberIds.filter((id) => !liveIds.has(id))
      if (unknown.length > 0) {
        throw new BusinessRuleError(
          ErrorCode.INVALID_GROUP_MEMBERS,
          'Group members must be live players of the user',
          { details: { unknown } },
        )
      }
    }
    return this.groupRepository.upsertLww(command.userId, {
      id: command.id,
      name: command.name,
      memberIds: command.memberIds,
      createdAt: command.createdAt,
      updatedAt: clampFutureDate(command.updatedAt),
      deletedAt: command.deletedAt,
    })
  }
}
