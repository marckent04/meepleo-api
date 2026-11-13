import { createTransactionHostMock } from '@/__tests__/utils/prisma.mock'
import { ErrorCode } from '@/shared/errors'
import { DEFAULT_SCORING_TEMPLATE } from '@/shared/types'
import { PLAY_INCLUDE, PLAY_SUMMARY_INCLUDE } from '../mappers'
import { PlayRepository } from './play.repository'

const date = new Date('2026-11-10T20:00:00.000Z')

function playRecord() {
  return {
    id: 'play-1',
    userId: 'user-1',
    gameId: 'game-1',
    status: 'IN_PROGRESS',
    playedAt: date,
    completedAt: null,
    note: null,
    scoring: { ...DEFAULT_SCORING_TEMPLATE },
    createdAt: date,
    updatedAt: date,
    deletedAt: null,
    game: { id: 'game-1', name: 'Catan', localizedNames: null, imageUrl: null },
    players: [],
    scores: [],
  }
}

function setup() {
  const { host, tx } = createTransactionHostMock({
    play: {
      create: vi.fn().mockResolvedValue(playRecord()),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    playPlayer: { updateMany: vi.fn() },
    playScore: { deleteMany: vi.fn(), createMany: vi.fn() },
  })
  return { repository: new PlayRepository(host), tx }
}

describe('PlayRepository', () => {
  it('creates a play with its players in display order', async () => {
    const { repository, tx } = setup()

    const play = await repository.create(
      {
        userId: 'user-1',
        gameId: 'game-1',
        playedAt: date,
        note: null,
        scoring: DEFAULT_SCORING_TEMPLATE,
        players: [
          {
            userId: 'user-1',
            playerId: null,
            color: null,
            shape: null,
            name: 'Marc',
            side: 0,
            total: 0,
            rank: 1,
            isWinner: false,
          },
          {
            userId: null,
            playerId: null,
            color: null,
            shape: null,
            name: 'Léa',
            side: 1,
            total: 0,
            rank: 1,
            isWinner: false,
          },
        ],
      },
      'fr',
    )

    expect(tx.play.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        gameId: 'game-1',
        scoring: DEFAULT_SCORING_TEMPLATE,
        players: {
          create: [
            expect.objectContaining({ name: 'Marc', position: 0 }),
            expect.objectContaining({ name: 'Léa', position: 1 }),
          ],
        },
      }),
      include: PLAY_INCLUDE,
    })
    expect(play).toMatchObject({ id: 'play-1', status: 'in_progress' })
  })

  it('only finds a non-deleted play of the user', async () => {
    const { repository, tx } = setup()
    tx.play.findFirst.mockResolvedValue(playRecord())

    await repository.findById('play-1', 'user-1', 'fr')

    expect(tx.play.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'play-1',
        userId: 'user-1',
        deletedAt: null,
        game: { deletedAt: null },
      },
      include: PLAY_INCLUDE,
    })
  })

  it('throws PLAY_NOT_FOUND for a play of another user', async () => {
    const { repository, tx } = setup()
    tx.play.findFirst.mockResolvedValue(null)

    await expect(
      repository.findById('play-1', 'user-2', 'fr'),
    ).rejects.toMatchObject({ code: ErrorCode.PLAY_NOT_FOUND })
  })

  it('lists the plays of a game, most recent first', async () => {
    const { repository, tx } = setup()

    await repository.listByUser('user-1', 'fr', {
      gameId: 'game-1',
      status: null,
      updatedSince: null,
      limit: 5,
      offset: 0,
    })

    expect(tx.play.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        deletedAt: null,
        game: { deletedAt: null },
        gameId: 'game-1',
      },
      orderBy: [{ playedAt: 'desc' }, { id: 'desc' }],
      take: 5,
      skip: 0,
      include: PLAY_SUMMARY_INCLUDE,
    })
  })

  it('replaces the cells and updates the results of each side', async () => {
    const { repository, tx } = setup()
    const scores = [{ side: 0, rowKey: '_total', round: 0, value: 12 }]

    await repository.replaceScores('play-1', scores, [
      { side: 0, total: 12, rank: 1 },
      { side: 1, total: 0, rank: 2 },
    ])

    expect(tx.playScore.deleteMany).toHaveBeenCalledWith({
      where: { playId: 'play-1' },
    })
    expect(tx.playScore.createMany).toHaveBeenCalledWith({
      data: [{ ...scores[0], playId: 'play-1' }],
    })
    expect(tx.playPlayer.updateMany).toHaveBeenCalledWith({
      where: { playId: 'play-1', side: 1 },
      data: { total: 0, rank: 2 },
    })
  })

  it('completes a play and marks only the winning sides', async () => {
    const { repository, tx } = setup()

    await repository.complete('play-1', date, [1])

    expect(tx.play.update).toHaveBeenCalledWith({
      where: { id: 'play-1' },
      data: {
        status: 'COMPLETED',
        completedAt: date,
        updatedAt: expect.any(Date),
      },
    })
    expect(tx.playPlayer.updateMany).toHaveBeenCalledWith({
      where: { playId: 'play-1', side: { notIn: [1] } },
      data: { isWinner: false },
    })
    expect(tx.playPlayer.updateMany).toHaveBeenCalledWith({
      where: { playId: 'play-1', side: { in: [1] } },
      data: { isWinner: true },
    })
  })

  it('reopens a play without winners', async () => {
    const { repository, tx } = setup()

    await repository.reopen('play-1')

    expect(tx.play.update).toHaveBeenCalledWith({
      where: { id: 'play-1' },
      data: {
        status: 'IN_PROGRESS',
        completedAt: null,
        updatedAt: expect.any(Date),
      },
    })
    expect(tx.playPlayer.updateMany).toHaveBeenCalledTimes(1)
  })

  it('soft deletes only a play of the user', async () => {
    const { repository, tx } = setup()

    await repository.softDelete('play-1', 'user-1')

    expect(tx.play.updateMany).toHaveBeenCalledWith({
      where: { id: 'play-1', userId: 'user-1', deletedAt: null },
      data: { deletedAt: expect.any(Date), updatedAt: expect.any(Date) },
    })
  })
})
