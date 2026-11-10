import type { Play, PlayPlayer, PlayStatus, PlaySummary } from '@/shared/types'
import type {
  PlayPlayer as PlayPlayerRecord,
  PlayStatus as PlayStatusRecord,
  Prisma,
} from '../generated/prisma/client'
import { localized } from './localized-text.mapper'
import { toPlayScoringTemplate } from './scoring-template.mapper'

const PLAY_GAME_SELECT = {
  select: { id: true, name: true, localizedNames: true, imageUrl: true },
} satisfies Prisma.GameDefaultArgs

const PLAY_PLAYERS = {
  orderBy: { position: 'asc' },
} satisfies Prisma.Play$playersArgs

/** Relations needed to build a PlaySummary. */
export const PLAY_SUMMARY_INCLUDE = {
  game: PLAY_GAME_SELECT,
  players: PLAY_PLAYERS,
} satisfies Prisma.PlayInclude

/** Relations needed to build a Play. */
export const PLAY_INCLUDE = {
  ...PLAY_SUMMARY_INCLUDE,
  scores: { orderBy: [{ round: 'asc' }, { rowKey: 'asc' }, { side: 'asc' }] },
} satisfies Prisma.PlayInclude

export type PlaySummaryRecord = Prisma.PlayGetPayload<{
  include: typeof PLAY_SUMMARY_INCLUDE
}>

export type PlayRecord = Prisma.PlayGetPayload<{
  include: typeof PLAY_INCLUDE
}>

export function toPlayStatus(status: PlayStatusRecord): PlayStatus {
  return status.toLowerCase() as PlayStatus
}

export function toPlayStatusRecord(status: PlayStatus): PlayStatusRecord {
  return status.toUpperCase() as PlayStatusRecord
}

function toPlayPlayer(record: PlayPlayerRecord): PlayPlayer {
  return {
    id: record.id,
    userId: record.userId,
    name: record.name,
    side: record.side,
    total: record.total,
    rank: record.rank,
    isWinner: record.isWinner,
  }
}

/** Game named in `language` when known, otherwise canonical name. */
export function toPlaySummary(
  record: PlaySummaryRecord,
  language: string,
): PlaySummary {
  return {
    id: record.id,
    game: {
      id: record.game.id,
      name: localized(record.game.localizedNames, language) || record.game.name,
      imageUrl: record.game.imageUrl,
    },
    status: toPlayStatus(record.status),
    playedAt: record.playedAt,
    completedAt: record.completedAt,
    note: record.note,
    players: record.players.map(toPlayPlayer),
  }
}

export function toPlay(record: PlayRecord, language: string): Play {
  return {
    ...toPlaySummary(record, language),
    scoring: toPlayScoringTemplate(record.scoring),
    scores: record.scores.map(({ side, rowKey, round, value }) => ({
      side,
      rowKey,
      round,
      value,
    })),
  }
}
