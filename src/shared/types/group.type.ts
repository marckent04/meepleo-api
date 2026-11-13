import type { SyncFields, SyncWrite } from './sync.type'

/** Named set of players; the owner is implicitly a member. */
export type Group = SyncFields & {
  id: string
  name: string
  memberIds: string[]
  /** Number of the user's plays that include at least one member. */
  matchCount: number
}

export type GroupWrite = SyncWrite & {
  name: string
  memberIds: string[]
}
