import type { SyncFields, SyncWrite } from './sync.type'

export const PLAYER_SHAPES = [
  'circle',
  'rounded_square',
  'triangle',
  'diamond',
] as const
export type PlayerShape = (typeof PLAYER_SHAPES)[number]

/** Person who plays, with a visual style; may exist without an account. */
export type Player = SyncFields & {
  id: string
  name: string
  /** `#RRGGBB`. */
  color: string
  shape: PlayerShape
  /** Handle of the linked Meepleo account, if any. */
  handle: string | null
  /** "It's me": at most one live player per user. */
  isCurrentUser: boolean
}

/** Player write coming from a client (a tombstone only needs the sync fields). */
export type PlayerWrite = SyncWrite & {
  name: string
  color: string
  shape: PlayerShape
  handle: string | null
  isCurrentUser: boolean
}
