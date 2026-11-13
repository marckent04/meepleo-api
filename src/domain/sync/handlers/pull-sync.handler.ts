import { QueryHandler } from '@nestjs/cqrs'
import {
  GroupRepository,
  PlayerRepository,
  PlayRepository,
  UserFavoriteRepository,
  UserGameRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import type { SyncChanges, SyncPullResult } from '@/shared/types'
import { AppQueryHandler } from '@/utils/cqrs.utils'
import { PullSyncQuery } from '../queries'
import { decodeSyncCursor, encodeSyncCursor } from '../sync-cursor'

type Change = {
  revision: number
  put: (changes: SyncChanges) => void
}

@QueryHandler(PullSyncQuery)
export class PullSyncHandler extends AppQueryHandler<
  PullSyncQuery,
  SyncPullResult
> {
  constructor(
    private readonly playerRepository: PlayerRepository,
    private readonly groupRepository: GroupRepository,
    private readonly playRepository: PlayRepository,
    private readonly userGameRepository: UserGameRepository,
    private readonly userFavoriteRepository: UserFavoriteRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', PullSyncQuery.name)
    this.logger.setContext(PullSyncHandler.name)
  }

  async handle({
    userId,
    language,
    cursor,
    limit,
  }: PullSyncQuery): Promise<SyncPullResult> {
    const from = decodeSyncCursor(cursor)
    // Every source is read up to `limit + 1` items: the first `limit + 1`
    // revisions of the merge are necessarily among them.
    const take = limit + 1
    const [players, groups, plays, userGames, favorites] = await Promise.all([
      this.playerRepository.listChangedSince(userId, from, take),
      this.groupRepository.listChangedSince(userId, from, take),
      this.playRepository.listChangedSince(userId, language, from, take),
      this.userGameRepository.listChangedSince(userId, language, from, take),
      this.userFavoriteRepository.listChangedSince(
        userId,
        language,
        from,
        take,
      ),
    ])

    const merged: Change[] = [
      ...players.map((entity) => ({
        revision: entity.revision,
        put: (changes: SyncChanges) => changes.players.push(entity),
      })),
      ...groups.map((entity) => ({
        revision: entity.revision,
        put: (changes: SyncChanges) => changes.groups.push(entity),
      })),
      ...plays.map((entity) => ({
        revision: entity.revision,
        put: (changes: SyncChanges) => changes.plays.push(entity),
      })),
      ...userGames.map(({ status, entry }) => ({
        revision: entry.revision,
        put: (changes: SyncChanges) =>
          (status === 'owned' ? changes.catalog : changes.wishlist).push(entry),
      })),
      ...favorites.map((entity) => ({
        revision: entity.revision,
        put: (changes: SyncChanges) => changes.favorites.push(entity),
      })),
    ].sort((a, b) => a.revision - b.revision)

    const page = merged.slice(0, limit)
    const changes: SyncChanges = {
      players: [],
      groups: [],
      plays: [],
      catalog: [],
      wishlist: [],
      favorites: [],
    }
    for (const change of page) change.put(changes)
    const last = page.at(-1)
    return {
      changes,
      cursor: encodeSyncCursor(last ? last.revision : from),
      hasMore: merged.length > limit,
    }
  }
}
