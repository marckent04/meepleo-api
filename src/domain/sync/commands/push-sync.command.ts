import { Command } from '@nestjs/cqrs'
import { IsArray, IsISO6391, IsUUID } from 'class-validator'
import type {
  GameListWrite,
  GroupWrite,
  PlayerWrite,
  SyncPushResult,
} from '@/shared/types'
import type { UpsertPlayContent } from '../../play'

/** Maximum number of items (all types together) in a push batch. */
export const SYNC_PUSH_MAX_ITEMS = 100

/** Play of a batch: the whole content, or only the tombstone fields. */
export type PlayPushItem = {
  id: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  content: UpsertPlayContent | null
}

export type PushSyncCommandParams = {
  userId: string
  language: string
  players: PlayerWrite[]
  groups: GroupWrite[]
  plays: PlayPushItem[]
  catalog: GameListWrite[]
  wishlist: GameListWrite[]
  favorites: GameListWrite[]
}

/**
 * Applies the changes made offline, one array per entity type, in the fixed
 * order players, groups, plays, catalog, wishlist, favorites. Every item is
 * arbitrated by last write wins on `updatedAt`; a rejected item does not
 * stop the others.
 */
export class PushSyncCommand extends Command<SyncPushResult> {
  @IsUUID()
  readonly userId: string

  @IsISO6391()
  readonly language: string

  @IsArray()
  readonly players: PlayerWrite[]

  @IsArray()
  readonly groups: GroupWrite[]

  @IsArray()
  readonly plays: PlayPushItem[]

  @IsArray()
  readonly catalog: GameListWrite[]

  @IsArray()
  readonly wishlist: GameListWrite[]

  @IsArray()
  readonly favorites: GameListWrite[]

  constructor(params: PushSyncCommandParams) {
    super()
    this.userId = params.userId
    this.language = params.language
    this.players = params.players
    this.groups = params.groups
    this.plays = params.plays
    this.catalog = params.catalog
    this.wishlist = params.wishlist
    this.favorites = params.favorites
  }

  get itemCount(): number {
    return (
      this.players.length +
      this.groups.length +
      this.plays.length +
      this.catalog.length +
      this.wishlist.length +
      this.favorites.length
    )
  }
}
