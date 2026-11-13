import { CommandBus, CommandHandler } from '@nestjs/cqrs'
import {
  GameRepository,
  UserFavoriteRepository,
  UserGameRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { AppError, ErrorCode, PayloadTooLargeError } from '@/shared/errors'
import type {
  GameListWrite,
  LwwResult,
  SyncItemResult,
  SyncPushResult,
} from '@/shared/types'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { UpsertGroupCommand } from '../../group'
import { UpsertPlayCommand } from '../../play'
import { UpsertPlayerCommand } from '../../player'
import { PushSyncCommand, SYNC_PUSH_MAX_ITEMS } from '../commands'
import { encodeSyncCursor } from '../sync-cursor'

/** Runs one item: its outcome is a result, a business error a rejection. */
async function settle<T extends { revision: number } | null>(
  id: string,
  run: () => Promise<LwwResult<T>>,
): Promise<SyncItemResult<NonNullable<T>>> {
  try {
    const { status, entity } = await run()
    return { id, status, entity: entity as NonNullable<T> | null }
  } catch (error) {
    // Unexpected errors (5xx) bubble up: the whole batch can be replayed.
    if (!(error instanceof AppError) || !error.expected) throw error
    return { id, status: 'rejected', code: error.code, message: error.message }
  }
}

@CommandHandler(PushSyncCommand)
export class PushSyncHandler extends AppCommandHandler<
  PushSyncCommand,
  SyncPushResult
> {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly gameRepository: GameRepository,
    private readonly userGameRepository: UserGameRepository,
    private readonly userFavoriteRepository: UserFavoriteRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', PushSyncCommand.name)
    this.logger.setContext(PushSyncHandler.name)
  }

  async handle(command: PushSyncCommand): Promise<SyncPushResult> {
    if (command.itemCount > SYNC_PUSH_MAX_ITEMS) {
      throw new PayloadTooLargeError('Sync batch too large', {
        details: { items: command.itemCount, max: SYNC_PUSH_MAX_ITEMS },
      })
    }
    const { userId, language } = command
    const rejectedPlayerIds = new Set<string>()
    const dependencyFailed = <T>(id: string): SyncItemResult<T> => ({
      id,
      status: 'rejected',
      code: ErrorCode.DEPENDENCY_FAILED,
      message: 'A player this item depends on was rejected',
    })

    // 1. Players: everything else may reference them.
    const players: SyncPushResultOf<'players'> = []
    for (const write of command.players) {
      const result = await settle(write.id, () =>
        this.commandBus.execute(new UpsertPlayerCommand({ userId, ...write })),
      )
      if (result.status === 'rejected') rejectedPlayerIds.add(write.id)
      players.push(result)
    }

    // 2. Groups.
    const groups: SyncPushResultOf<'groups'> = []
    for (const write of command.groups) {
      if (write.memberIds.some((id) => rejectedPlayerIds.has(id))) {
        groups.push(dependencyFailed(write.id))
        continue
      }
      groups.push(
        await settle(write.id, () =>
          this.commandBus.execute(new UpsertGroupCommand({ userId, ...write })),
        ),
      )
    }

    // 3. Plays.
    const plays: SyncPushResultOf<'plays'> = []
    for (const item of command.plays) {
      const referenced = [
        ...(item.content?.players.map(({ playerId }) => playerId) ?? []),
        ...(item.content?.firstPlayerId ? [item.content.firstPlayerId] : []),
      ]
      if (referenced.some((id) => rejectedPlayerIds.has(id))) {
        plays.push(dependencyFailed(item.id))
        continue
      }
      plays.push(
        await settle(item.id, () =>
          this.commandBus.execute(
            new UpsertPlayCommand({ userId, language, ...item }),
          ),
        ),
      )
    }

    // 4. Library, wishlist ("library or wishlist, never both"), favorites.
    const catalog = await this.applyGameList(command.catalog, (write) =>
      this.userGameRepository.applyLww(userId, 'owned', write, language),
    )
    const wishlist = await this.applyGameList(command.wishlist, (write) =>
      this.userGameRepository.applyLww(userId, 'wishlist', write, language),
    )
    const favorites = await this.applyGameList(command.favorites, (write) =>
      this.userFavoriteRepository.applyLww(userId, write, language),
    )

    const results = { players, groups, plays, catalog, wishlist, favorites }
    const revisions = Object.values(results)
      .flat()
      .flatMap((result) =>
        result.status !== 'rejected' && result.entity
          ? [result.entity.revision]
          : [],
      )
    return { results, cursor: encodeSyncCursor(Math.max(0, ...revisions)) }
  }

  private applyGameList<T extends { revision: number } | null>(
    writes: GameListWrite[],
    apply: (write: GameListWrite) => Promise<LwwResult<T>>,
  ): Promise<SyncItemResult<NonNullable<T>>[]> {
    return this.sequentially(writes, (write) =>
      settle(write.gameId, async () => {
        if (write.deletedAt === null) {
          // Throws GAME_NOT_FOUND (404) if the game does not exist or is deleted.
          await this.gameRepository.findById(write.gameId)
        }
        return apply(write)
      }),
    )
  }

  private async sequentially<I, R>(
    items: I[],
    run: (item: I) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = []
    for (const item of items) results.push(await run(item))
    return results
  }
}

type SyncPushResultOf<K extends keyof SyncPushResult['results']> =
  SyncPushResult['results'][K]
