import { DEFAULT_SCORING_TEMPLATE } from '@/shared/types'
import { type PlayRecord, toPlay, toPlayStatusRecord } from './play.mapper'

const date = new Date('2026-11-10T20:00:00.000Z')

function record(): PlayRecord {
  return {
    id: 'play-1',
    userId: 'user-1',
    gameId: 'game-1',
    status: 'COMPLETED',
    playedAt: date,
    completedAt: date,
    startedAt: null,
    endedAt: null,
    durationSeconds: null,
    firstPlayerId: null,
    revision: BigInt(7),
    note: 'Revanche',
    scoring: { ...DEFAULT_SCORING_TEMPLATE },
    createdAt: date,
    updatedAt: date,
    deletedAt: null,
    game: {
      id: 'game-1',
      name: '6 nimmt!',
      localizedNames: { fr: '6 qui prend !' },
      imageUrl: null,
    },
    players: [
      {
        id: 'player-1',
        playId: 'play-1',
        userId: 'user-1',
        playerId: null,
        color: null,
        shape: null,
        name: 'Marc',
        position: 0,
        side: 0,
        total: 17,
        rank: 1,
        isWinner: true,
        createdAt: date,
      },
    ],
    scores: [
      {
        id: 'score-1',
        playId: 'play-1',
        side: 0,
        rowKey: '_total',
        round: 0,
        value: 17,
        createdAt: date,
      },
    ],
  }
}

describe('play mapper', () => {
  it('maps a play, naming the game in the requested language', () => {
    expect(toPlay(record(), 'fr')).toEqual({
      id: 'play-1',
      game: { id: 'game-1', name: '6 qui prend !', imageUrl: null },
      status: 'completed',
      playedAt: date,
      completedAt: date,
      startedAt: null,
      endedAt: null,
      durationSeconds: null,
      firstPlayerId: null,
      createdAt: date,
      updatedAt: date,
      deletedAt: null,
      revision: 7,
      note: 'Revanche',
      players: [
        {
          id: 'player-1',
          userId: 'user-1',
          playerId: null,
          color: null,
          shape: null,
          name: 'Marc',
          side: 0,
          total: 17,
          rank: 1,
          isWinner: true,
        },
      ],
      scoring: DEFAULT_SCORING_TEMPLATE,
      scores: [{ side: 0, rowKey: '_total', round: 0, value: 17 }],
    })
  })

  it('falls back to the canonical game name', () => {
    expect(toPlay(record(), 'en').game.name).toBe('6 nimmt!')
  })

  it('maps the statuses to the database enum', () => {
    expect(toPlayStatusRecord('in_progress')).toBe('IN_PROGRESS')
    expect(toPlayStatusRecord('completed')).toBe('COMPLETED')
  })
})
