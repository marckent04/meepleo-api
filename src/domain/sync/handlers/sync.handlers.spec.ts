import { CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import {
  GameRepository,
  GroupRepository,
  PlayerRepository,
  PlayRepository,
  UserFavoriteRepository,
  UserGameRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import {
  BusinessRuleError,
  ErrorCode,
  NotFoundError,
  PayloadTooLargeError,
} from '@/shared/errors'
import { UpsertGroupCommand } from '../../group'
import { UpsertPlayCommand } from '../../play'
import { UpsertPlayerCommand } from '../../player'
import { PushSyncCommand } from '../commands'
import { PullSyncQuery } from '../queries'
import { decodeSyncCursor, encodeSyncCursor } from '../sync-cursor'
import { PullSyncHandler } from './pull-sync.handler'
import { PushSyncHandler } from './push-sync.handler'

const userId = '0195d1a2-0000-7000-8000-000000000001'
const p1 = '0195d1a2-0000-7000-8000-0000000000a1'
const p2 = '0195d1a2-0000-7000-8000-0000000000a2'
const g1 = '0195d1a2-0000-7000-8000-0000000000c1'
const game = '0195d1a2-0000-7000-8000-0000000000d1'
const t = new Date('2026-11-12T10:00:00.000Z')

const sync = { createdAt: t, updatedAt: t, deletedAt: null }
const player = (id: string) => ({
  id,
  ...sync,
  name: 'P',
  color: '#000000',
  shape: 'circle' as const,
  handle: null,
  isCurrentUser: false,
})
const group = (memberIds: string[]) => ({
  id: g1,
  ...sync,
  name: 'G',
  memberIds,
})
const playItem = (playerIds: string[]) => ({
  id: '0195d1a2-0000-7000-8000-0000000000b1',
  ...sync,
  content: {
    gameId: game,
    status: 'completed' as const,
    playedAt: t,
    startedAt: null,
    endedAt: null,
    durationSeconds: null,
    firstPlayerId: null,
    note: null,
    players: playerIds.map((playerId, side) => ({
      playerId,
      name: 'P',
      color: '#000000',
      shape: 'circle' as const,
      side,
      isCurrentUser: false,
    })),
    scoring: {
      sides: 'individual' as const,
      outcome: 'highest' as const,
      rounds: null,
      targetScore: null,
      rows: [],
      tieBreaker: null,
    },
    scores: [],
    winnerSides: null,
  },
})
const entry = (id: string, revision: number) => ({ id, revision })

function push(
  overrides: Partial<ConstructorParameters<typeof PushSyncCommand>[0]> = {},
) {
  return new PushSyncCommand({
    userId,
    language: 'fr',
    players: [],
    groups: [],
    plays: [],
    catalog: [],
    wishlist: [],
    favorites: [],
    ...overrides,
  })
}

describe('PushSyncHandler', () => {
  const commandBus = { execute: vi.fn() }
  const gameRepository = { findById: vi.fn() }
  const userGameRepository = { applyLww: vi.fn() }
  const userFavoriteRepository = { applyLww: vi.fn() }
  let handler: PushSyncHandler

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PushSyncHandler,
        { provide: CommandBus, useValue: commandBus },
        { provide: GameRepository, useValue: gameRepository },
        { provide: UserGameRepository, useValue: userGameRepository },
        { provide: UserFavoriteRepository, useValue: userFavoriteRepository },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile()
    handler = moduleRef.get(PushSyncHandler)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('processes the types in the fixed order and returns one result per item', async () => {
    const order: string[] = []
    commandBus.execute.mockImplementation(async (command: unknown) => {
      order.push(command!.constructor.name)
      return { status: 'ok', entity: entry('x', 5) }
    })
    userGameRepository.applyLww.mockImplementation(async (_u, status) => {
      order.push(status)
      return { status: 'ok', entity: entry('x', 9) }
    })
    userFavoriteRepository.applyLww.mockImplementation(async () => {
      order.push('favorites')
      return { status: 'ok', entity: entry('x', 7) }
    })

    const result = await handler.execute(
      push({
        favorites: [{ gameId: game, ...sync }],
        wishlist: [{ gameId: game, ...sync }],
        catalog: [{ gameId: game, ...sync }],
        plays: [playItem([p1, p2])],
        groups: [group([p1])],
        players: [player(p1), player(p2)],
      }),
    )

    expect(order).toEqual([
      UpsertPlayerCommand.name,
      UpsertPlayerCommand.name,
      UpsertGroupCommand.name,
      UpsertPlayCommand.name,
      'owned',
      'wishlist',
      'favorites',
    ])
    expect(result.results.players.map(({ status }) => status)).toEqual([
      'ok',
      'ok',
    ])
    expect(decodeSyncCursor(result.cursor)).toBe(9)
  })

  it('rejects a business error without stopping the other items', async () => {
    commandBus.execute
      .mockRejectedValueOnce(
        new BusinessRuleError(ErrorCode.INVALID_PLAY_PLAYERS, 'bad'),
      )
      .mockResolvedValueOnce({ status: 'conflict', entity: entry('b', 2) })

    const { results } = await handler.execute(
      push({ players: [player(p1), player(p2)] }),
    )

    expect(results.players).toEqual([
      expect.objectContaining({
        id: p1,
        status: 'rejected',
        code: ErrorCode.INVALID_PLAY_PLAYERS,
      }),
      expect.objectContaining({ id: p2, status: 'conflict' }),
    ])
  })

  it('fails the dependents of a rejected player with DEPENDENCY_FAILED', async () => {
    commandBus.execute.mockRejectedValueOnce(
      new BusinessRuleError(ErrorCode.INVALID_PLAY_PLAYERS, 'bad'),
    )

    const { results } = await handler.execute(
      push({
        players: [player(p1)],
        groups: [group([p1])],
        plays: [playItem([p1])],
      }),
    )

    expect(results.groups[0]).toMatchObject({
      status: 'rejected',
      code: ErrorCode.DEPENDENCY_FAILED,
    })
    expect(results.plays[0]).toMatchObject({
      status: 'rejected',
      code: ErrorCode.DEPENDENCY_FAILED,
    })
    expect(commandBus.execute).toHaveBeenCalledTimes(1)
  })

  it('rejects an unknown game of a list', async () => {
    gameRepository.findById.mockRejectedValue(
      new NotFoundError('no', { code: ErrorCode.GAME_NOT_FOUND }),
    )

    const { results } = await handler.execute(
      push({ catalog: [{ gameId: game, ...sync }] }),
    )

    expect(results.catalog[0]).toMatchObject({
      status: 'rejected',
      code: ErrorCode.GAME_NOT_FOUND,
    })
  })

  it('does not look the game up for a removal', async () => {
    userGameRepository.applyLww.mockResolvedValue({
      status: 'ok',
      entity: null,
    })

    await handler.execute(
      push({ wishlist: [{ gameId: game, ...sync, deletedAt: t }] }),
    )

    expect(gameRepository.findById).not.toHaveBeenCalled()
  })

  it('lets unexpected errors bubble up so the batch can be replayed', async () => {
    commandBus.execute.mockRejectedValue(new Error('db down'))

    await expect(
      handler.execute(push({ players: [player(p1)] })),
    ).rejects.toThrow('db down')
  })

  it('rejects a batch above the size limit', async () => {
    const players = Array.from({ length: 101 }, () => player(p1))

    await expect(handler.execute(push({ players }))).rejects.toBeInstanceOf(
      PayloadTooLargeError,
    )
  })
})

describe('PullSyncHandler', () => {
  const playerRepository = { listChangedSince: vi.fn() }
  const groupRepository = { listChangedSince: vi.fn() }
  const playRepository = { listChangedSince: vi.fn() }
  const userGameRepository = { listChangedSince: vi.fn() }
  const userFavoriteRepository = { listChangedSince: vi.fn() }
  let handler: PullSyncHandler

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PullSyncHandler,
        { provide: PlayerRepository, useValue: playerRepository },
        { provide: GroupRepository, useValue: groupRepository },
        { provide: PlayRepository, useValue: playRepository },
        { provide: UserGameRepository, useValue: userGameRepository },
        { provide: UserFavoriteRepository, useValue: userFavoriteRepository },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile()
    handler = moduleRef.get(PullSyncHandler)
    for (const repository of [
      playerRepository,
      groupRepository,
      playRepository,
      userGameRepository,
      userFavoriteRepository,
    ]) {
      repository.listChangedSince.mockResolvedValue([])
    }
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('merges the sources by revision and cuts at the limit', async () => {
    playerRepository.listChangedSince.mockResolvedValue([
      entry('p', 1),
      entry('p', 4),
    ])
    playRepository.listChangedSince.mockResolvedValue([entry('pl', 2)])
    userGameRepository.listChangedSince.mockResolvedValue([
      { status: 'wishlist', entry: entry('w', 3) },
    ])

    const result = await handler.execute(
      new PullSyncQuery({ userId, language: 'fr', limit: 3 }),
    )

    expect(result.changes.players.map(({ id }) => id)).toEqual(['p'])
    expect(result.changes.plays).toHaveLength(1)
    expect(result.changes.wishlist).toHaveLength(1)
    expect(result.hasMore).toBe(true)
    expect(decodeSyncCursor(result.cursor)).toBe(3)
  })

  it('reads from the revision of the cursor', async () => {
    await handler.execute(
      new PullSyncQuery({
        userId,
        language: 'fr',
        cursor: encodeSyncCursor(42),
        limit: 10,
      }),
    )

    expect(playerRepository.listChangedSince).toHaveBeenCalledWith(
      userId,
      42,
      11,
    )
  })

  it('keeps the cursor when nothing changed', async () => {
    const result = await handler.execute(
      new PullSyncQuery({
        userId,
        language: 'fr',
        cursor: encodeSyncCursor(42),
      }),
    )

    expect(result.hasMore).toBe(false)
    expect(decodeSyncCursor(result.cursor)).toBe(42)
  })

  it('rejects an invalid cursor', async () => {
    await expect(
      handler.execute(
        new PullSyncQuery({ userId, language: 'fr', cursor: 'garbage' }),
      ),
    ).rejects.toMatchObject({ statusCode: 400 })
  })
})
