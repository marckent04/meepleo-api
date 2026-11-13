import { Test } from '@nestjs/testing'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import {
  GameRepository,
  PlayerRepository,
  PlayRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { ErrorCode, NotFoundError } from '@/shared/errors'
import { UpsertPlayCommand, type UpsertPlayContent } from '../commands'
import { UpsertPlayHandler } from './upsert-play.handler'

vi.mock('@nestjs-cls/transactional', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Transactional: () => () => undefined,
}))

const userId = '0195d1a2-0000-7000-8000-000000000001'
const id = '0195d1a2-0000-7000-8000-000000000002'
const gameId = '0195d1a2-0000-7000-8000-000000000003'
const p1 = '0195d1a2-0000-7000-8000-0000000000a1'
const p2 = '0195d1a2-0000-7000-8000-0000000000a2'
const t = new Date('2026-11-12T10:00:00.000Z')

const highest = {
  sides: 'individual' as const,
  outcome: 'highest' as const,
  rounds: null,
  targetScore: null,
  rows: [],
  tieBreaker: null,
}

function content(
  overrides: Partial<UpsertPlayContent> = {},
): UpsertPlayContent {
  return {
    gameId,
    status: 'completed',
    playedAt: t,
    startedAt: null,
    endedAt: null,
    durationSeconds: null,
    firstPlayerId: null,
    note: null,
    players: [p1, p2].map((playerId, side) => ({
      playerId,
      name: `P${side}`,
      color: '#112233',
      shape: 'circle' as const,
      side,
      isCurrentUser: side === 0,
    })),
    scoring: highest,
    scores: [
      { side: 0, rowKey: '_total', round: 0, value: 10 },
      { side: 1, rowKey: '_total', round: 0, value: 20 },
    ],
    winnerSides: null,
    ...overrides,
  }
}

function command(c: UpsertPlayContent | null, deletedAt: Date | null = null) {
  return new UpsertPlayCommand({
    userId,
    language: 'fr',
    id,
    createdAt: t,
    updatedAt: t,
    deletedAt,
    content: c,
  })
}

describe('UpsertPlayHandler', () => {
  const gameRepository = { findById: vi.fn() }
  const playerRepository = { findOwnedIds: vi.fn() }
  const playRepository = { upsertLww: vi.fn() }
  let handler: UpsertPlayHandler

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        UpsertPlayHandler,
        { provide: GameRepository, useValue: gameRepository },
        { provide: PlayerRepository, useValue: playerRepository },
        { provide: PlayRepository, useValue: playRepository },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile()
    handler = moduleRef.get(UpsertPlayHandler)
    playerRepository.findOwnedIds.mockResolvedValue(new Set([p1, p2]))
    playRepository.upsertLww.mockResolvedValue({ status: 'ok', entity: {} })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('creates a completed play in one call, computing totals, ranks and winners', async () => {
    await handler.execute(command(content()))

    const [, write, language] = playRepository.upsertLww.mock.calls[0]
    expect(language).toBe('fr')
    expect(write).toMatchObject({
      id,
      status: 'completed',
      completedAt: t,
      players: [
        { playerId: p1, userId, total: 10, rank: 2, isWinner: false },
        { playerId: p2, userId: null, total: 20, rank: 1, isWinner: true },
      ],
    })
  })

  it('keeps an in-progress play without winners', async () => {
    await handler.execute(command(content({ status: 'in_progress' })))

    const [, write] = playRepository.upsertLww.mock.calls[0]
    expect(write.completedAt).toBeNull()
    expect(
      write.players.every(({ isWinner }: { isWinner: boolean }) => !isWinner),
    ).toBe(true)
  })

  it('uses the winners sent', async () => {
    await handler.execute(command(content({ winnerSides: [0, 1] })))

    const [, write] = playRepository.upsertLww.mock.calls[0]
    expect(
      write.players.map(({ isWinner }: { isWinner: boolean }) => isWinner),
    ).toEqual([true, true])
  })

  it('requires the winners for a manual outcome', async () => {
    await expect(
      handler.execute(
        command(
          content({
            scoring: { ...highest, outcome: 'manual' },
            scores: [],
          }),
        ),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_PLAY_WINNERS })
  })

  it('rejects a player that does not belong to the user', async () => {
    playerRepository.findOwnedIds.mockResolvedValue(new Set([p1]))

    await expect(handler.execute(command(content()))).rejects.toMatchObject({
      code: ErrorCode.INVALID_PLAY_PLAYERS,
    })
    expect(playRepository.upsertLww).not.toHaveBeenCalled()
  })

  it('rejects a score that is not in the score sheet', async () => {
    await expect(
      handler.execute(
        command(
          content({
            scores: [{ side: 0, rowKey: 'unknown', round: 0, value: 1 }],
          }),
        ),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_PLAY_SCORES })
  })

  it('rejects an unknown game', async () => {
    gameRepository.findById.mockRejectedValue(
      new NotFoundError('no', { code: ErrorCode.GAME_NOT_FOUND }),
    )

    await expect(handler.execute(command(content()))).rejects.toMatchObject({
      code: ErrorCode.GAME_NOT_FOUND,
    })
  })

  it('applies a tombstone without validating the content', async () => {
    await handler.execute(command(null, t))

    expect(gameRepository.findById).not.toHaveBeenCalled()
    expect(playRepository.upsertLww).toHaveBeenCalledWith(
      userId,
      { id, updatedAt: t, deletedAt: t },
      'fr',
    )
  })
})
