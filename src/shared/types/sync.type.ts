import type { ErrorCode } from '../errors/error-codes'
import type { CatalogEntry } from './catalog-entry.type'
import type { FavoriteEntry } from './favorite-entry.type'
import type { Group } from './group.type'
import type { Play } from './play.type'
import type { Player } from './player.type'

/** Fields shared by every synchronizable entity. */
export type SyncFields = {
  createdAt: Date
  /** Last modification date, set by the client; arbitrates conflicts. */
  updatedAt: Date
  /** Tombstone date when the entity is deleted. */
  deletedAt: Date | null
  /** Server-side change counter, cursor of `sync/pull`. */
  revision: number
}

/** Result of a last-write-wins write: the stored state is always returned. */
export type LwwResult<T> = {
  /** `ok`: applied or already applied; `conflict`: the server version is newer. */
  status: 'ok' | 'conflict'
  entity: T
}

/** Client-side fields of a synchronizable write. */
export type SyncWrite = {
  id: string
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
}

/** Outcome of one item of a `sync/push` batch. */
export type SyncItemResult<T> =
  | {
      id: string
      /** `ok`: applied or already applied; `conflict`: the server version is newer. */
      status: 'ok' | 'conflict'
      /** Server state; null when the item does not concern a stored entity. */
      entity: T | null
    }
  | {
      id: string
      status: 'rejected'
      code: ErrorCode
      /** Technical message, not meant to be displayed (use `code`). */
      message: string
    }

export type SyncPushResults = {
  players: SyncItemResult<Player>[]
  groups: SyncItemResult<Group>[]
  plays: SyncItemResult<Play>[]
  catalog: SyncItemResult<CatalogEntry>[]
  wishlist: SyncItemResult<CatalogEntry>[]
  favorites: SyncItemResult<FavoriteEntry>[]
}

export type SyncPushResult = {
  results: SyncPushResults
  /** Opaque cursor: highest revision assigned by this batch. */
  cursor: string
}

export type SyncChanges = {
  players: Player[]
  groups: Group[]
  plays: Play[]
  catalog: CatalogEntry[]
  wishlist: CatalogEntry[]
  favorites: FavoriteEntry[]
}

export type SyncPullResult = {
  changes: SyncChanges
  /** Opaque, monotone cursor to send back to continue from this point. */
  cursor: string
  hasMore: boolean
}
