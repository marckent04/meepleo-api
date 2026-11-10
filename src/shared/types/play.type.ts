import type { ScoringTemplate } from './scoring-template.type'

export const PLAY_STATUSES = ['in_progress', 'completed'] as const
export type PlayStatus = (typeof PLAY_STATUSES)[number]

/** Score cell: one value per side, row and round. */
export type PlayScore = {
  /** Column of the score sheet (0-based). */
  side: number
  /** Template row key, or `ROUND_SCORE_KEY` / `TOTAL_SCORE_KEY`. */
  rowKey: string
  /** Round number (>= 1) of a round cell, 0 otherwise. */
  round: number
  /** Entered value: points, counted units, or 0 / 1 for a toggle. */
  value: number
}

export type PlayPlayer = {
  id: string
  /** Account of the player, null for a guest. */
  userId: string | null
  name: string
  /** Column of the score sheet; team mates share it. */
  side: number
  /** Total of the side, null when the outcome is chosen manually. */
  total: number | null
  /** Rank of the side (1 = first, ties share a rank), null when manual. */
  rank: number | null
  isWinner: boolean
}

/** Game of a play, named in the requested language. */
export type PlayGame = {
  id: string
  name: string
  imageUrl: string | null
}

/** Play without its score sheet, for lists. */
export type PlaySummary = {
  id: string
  game: PlayGame
  status: PlayStatus
  playedAt: Date
  completedAt: Date | null
  note: string | null
  players: PlayPlayer[]
}

/** Play recorded by a user, with its score sheet. */
export type Play = PlaySummary & {
  /** Copy of the game template taken at creation, possibly adapted. */
  scoring: ScoringTemplate
  scores: PlayScore[]
}

/** Play to record, players in display order. */
export type NewPlay = {
  userId: string
  gameId: string
  playedAt: Date
  note: string | null
  scoring: ScoringTemplate
  players: Omit<PlayPlayer, 'id'>[]
}

/** Totals and ranks computed from a score sheet, per side. */
export type PlaySideResult = {
  side: number
  total: number | null
  rank: number | null
}
