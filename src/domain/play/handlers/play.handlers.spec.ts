import { Test } from '@nestjs/testing'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import {
  GameRepository,
  PlayRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import {
  BusinessRuleError,
  ConflictError,
  ErrorCode,
  NotFoundError,
} from '@/shared/errors'
import {
  DEFAULT_SCORING_TEMPLATE,
  type Play,
  type PlayPlayer,
  ROUND_SCORE_KEY,
  type ScoringTemplate,
  TOTAL_SCORE_KEY,
} from '@/shared/types'
import {
  CompletePlayCommand,
  CreatePlayCommand,
  type CreatePlayCommandParams,
  DeletePlayCommand,
  ReopenPlayCommand,
  SavePlayScoresCommand,
  UpdatePlayCommand,
} from '../commands'
import { GetPlayQuery, ListPlaysQuery } from '../queries'
import { CompletePlayHandler } from './complete-play.handler'
import { CreatePlayHandler } from './create-play.handler'
import { DeletePlayHandler } from './delete-play.handler'
import { GetPlayHandler } from './get-play.handler'
import { ListPlaysHandler } from './list-plays.handler'
import { ReopenPlayHandler } from './reopen-play.handler'
import { SavePlayScoresHandler } from './save-play-scores.handler'
import { UpdatePlayHandler } from './update-play.handler'

// The transaction is tested end to end; here we test the sequence.
vi.mock('@nestjs-cls/transactional', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Transactional: () => () => undefined,
}))

const userId = '0195d1a2-0000-7000-8000-000000000001'
const gameId = '0195d1a2-0000-7000-8000-000000000002'
const playId = '0195d1a2-0000-7000-8000-000000000003'

const lowestRounds: ScoringTemplate = {
  ...DEFAULT_SCORING_TEMPLATE,
  outcome: 'lowest',
  rounds: { count: null },
  targetScore: 66,
}

const manual: ScoringTemplate = {
  ...DEFAULT_SCORING_TEMPLATE,
  outcome: 'manual',
}

function player(side: number, overrides: Partial<PlayPlayer> = {}): PlayPlayer {
  return {
    id: `0195d1a2-0000-7000-8000-00000000010${side}`,
    userId: null,
    playerId: null,
    color: null,
    shape: null,
    name: `Player ${side}`,
    side,
    total: 0,
    rank: 1,
    isWinner: false,
    ...overrides,
  }
}

function play(overrides: Partial<Play> = {}): Play {
  return {
    id: playId,
    game: { id: gameId, name: '6 nimmt!', imageUrl: null },
    status: 'in_progress',
    playedAt: new Date('2026-11-10T20:00:00.000Z'),
    completedAt: null,
    createdAt: new Date('2026-11-10T20:00:00.000Z'),
    updatedAt: new Date('2026-11-10T20:00:00.000Z'),
    deletedAt: null,
    revision: 1,
    startedAt: null,
    endedAt: null,
    durationSeconds: null,
    firstPlayerId: null,
    note: null,
    players: [player(0), player(1)],
    scoring: lowestRounds,
    scores: [],
    ...overrides,
  }
}

function createParams(
  overrides: Partial<CreatePlayCommandParams> = {},
): CreatePlayCommandParams {
  return {
    userId,
    gameId,
    language: 'fr',
    playedAt: null,
    note: null,
    players: [
      { name: 'Marc', side: 0, isCurrentUser: true },
      { name: 'Léa', side: 1, isCurrentUser: false },
    ],
    scoring: null,
    sides: null,
    ...overrides,
  }
}

async function codeOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return (error as { code?: unknown }).code
  }
  throw new Error('Expected the promise to reject')
}

describe('play handlers', () => {
  const gameRepository = { findScoringTemplate: vi.fn() }
  const playRepository = {
    create: vi.fn(),
    findById: vi.fn(),
    listByUser: vi.fn(),
    replaceScores: vi.fn(),
    updateDetails: vi.fn(),
    complete: vi.fn(),
    reopen: vi.fn(),
    softDelete: vi.fn(),
  }
  let create: CreatePlayHandler
  let saveScores: SavePlayScoresHandler
  let update: UpdatePlayHandler
  let complete: CompletePlayHandler
  let reopen: ReopenPlayHandler
  let remove: DeletePlayHandler
  let get: GetPlayHandler
  let list: ListPlaysHandler

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CreatePlayHandler,
        SavePlayScoresHandler,
        UpdatePlayHandler,
        CompletePlayHandler,
        ReopenPlayHandler,
        DeletePlayHandler,
        GetPlayHandler,
        ListPlaysHandler,
        { provide: GameRepository, useValue: gameRepository },
        { provide: PlayRepository, useValue: playRepository },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile()
    create = moduleRef.get(CreatePlayHandler)
    saveScores = moduleRef.get(SavePlayScoresHandler)
    update = moduleRef.get(UpdatePlayHandler)
    complete = moduleRef.get(CompletePlayHandler)
    reopen = moduleRef.get(ReopenPlayHandler)
    remove = moduleRef.get(DeletePlayHandler)
    get = moduleRef.get(GetPlayHandler)
    list = moduleRef.get(ListPlaysHandler)
    playRepository.create.mockImplementation(async () => play())
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('CreatePlayHandler', () => {
    it('copies the game template and links the current user', async () => {
      gameRepository.findScoringTemplate.mockResolvedValue(lowestRounds)

      await create.execute(new CreatePlayCommand(createParams()))

      expect(gameRepository.findScoringTemplate).toHaveBeenCalledWith(
        gameId,
        'fr',
      )
      const [newPlay, language] = playRepository.create.mock.calls[0]
      expect(language).toBe('fr')
      expect(newPlay).toMatchObject({
        userId,
        gameId,
        note: null,
        scoring: lowestRounds,
        players: [
          { userId, name: 'Marc', side: 0, total: 0, rank: 1, isWinner: false },
          { userId: null, name: 'Léa', side: 1, total: 0, rank: 1 },
        ],
      })
      expect(newPlay.playedAt).toBeInstanceOf(Date)
    })

    it('uses the default template for a game without one', async () => {
      gameRepository.findScoringTemplate.mockResolvedValue(null)

      await create.execute(new CreatePlayCommand(createParams()))

      expect(playRepository.create.mock.calls[0][0].scoring).toEqual(
        DEFAULT_SCORING_TEMPLATE,
      )
    })

    it('prefers the template sent and overrides its sides', async () => {
      gameRepository.findScoringTemplate.mockResolvedValue(lowestRounds)

      await create.execute(
        new CreatePlayCommand(
          createParams({
            scoring: manual,
            sides: 'teams',
            players: [
              { name: 'A', side: 0, isCurrentUser: false },
              { name: 'B', side: 1, isCurrentUser: false },
              { name: 'C', side: 0, isCurrentUser: false },
              { name: 'D', side: 1, isCurrentUser: false },
            ],
          }),
        ),
      )

      const { scoring, players } = playRepository.create.mock.calls[0][0]
      expect(scoring).toEqual({ ...manual, sides: 'teams' })
      expect(players.map((p: PlayPlayer) => [p.total, p.rank])).toEqual([
        [null, null],
        [null, null],
        [null, null],
        [null, null],
      ])
    })

    it('rejects players that do not match the sides', async () => {
      gameRepository.findScoringTemplate.mockResolvedValue(null)

      const code = await codeOf(
        create.execute(
          new CreatePlayCommand(
            createParams({
              players: [
                { name: 'A', side: 0, isCurrentUser: false },
                { name: 'B', side: 0, isCurrentUser: false },
              ],
            }),
          ),
        ),
      )

      expect(code).toBe(ErrorCode.INVALID_PLAY_PLAYERS)
      expect(playRepository.create).not.toHaveBeenCalled()
    })

    it('rejects two current users', async () => {
      gameRepository.findScoringTemplate.mockResolvedValue(null)

      const code = await codeOf(
        create.execute(
          new CreatePlayCommand(
            createParams({
              players: [
                { name: 'A', side: 0, isCurrentUser: true },
                { name: 'B', side: 1, isCurrentUser: true },
              ],
            }),
          ),
        ),
      )

      expect(code).toBe(ErrorCode.INVALID_PLAY_PLAYERS)
    })

    it('rejects an inconsistent template', async () => {
      gameRepository.findScoringTemplate.mockResolvedValue(null)

      const code = await codeOf(
        create.execute(
          new CreatePlayCommand(
            createParams({ scoring: { ...manual, rounds: { count: 3 } } }),
          ),
        ),
      )

      expect(code).toBe(ErrorCode.INVALID_SCORING_TEMPLATE)
    })

    it('rejects an empty player name before any read', async () => {
      const code = await codeOf(
        create.execute(
          new CreatePlayCommand(
            createParams({
              players: [{ name: '', side: 0, isCurrentUser: false }],
            }),
          ),
        ),
      )

      expect(code).toBe(ErrorCode.VALIDATION_FAILED)
      expect(gameRepository.findScoringTemplate).not.toHaveBeenCalled()
    })

    it('does not create a play of an unknown game', async () => {
      gameRepository.findScoringTemplate.mockRejectedValue(
        new NotFoundError('Game not found', { code: ErrorCode.GAME_NOT_FOUND }),
      )

      await expect(
        create.execute(new CreatePlayCommand(createParams())),
      ).rejects.toBeInstanceOf(NotFoundError)
      expect(playRepository.create).not.toHaveBeenCalled()
    })
  })

  describe('SavePlayScoresHandler', () => {
    const scores = [
      { side: 0, rowKey: ROUND_SCORE_KEY, round: 1, value: 12 },
      { side: 1, rowKey: ROUND_SCORE_KEY, round: 1, value: 7 },
    ]

    it('replaces the cells with the computed totals and ranks', async () => {
      playRepository.findById.mockResolvedValue(play())

      await saveScores.execute(
        new SavePlayScoresCommand({ userId, playId, language: 'fr', scores }),
      )

      expect(playRepository.findById).toHaveBeenCalledWith(playId, userId, 'fr')
      expect(playRepository.replaceScores).toHaveBeenCalledWith(
        playId,
        scores,
        [
          { side: 0, total: 12, rank: 2 },
          { side: 1, total: 7, rank: 1 },
        ],
      )
    })

    it('refuses to change a completed play', async () => {
      playRepository.findById.mockResolvedValue(play({ status: 'completed' }))

      const error = await saveScores
        .execute(
          new SavePlayScoresCommand({ userId, playId, language: 'fr', scores }),
        )
        .catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(ConflictError)
      expect(error).toMatchObject({ code: ErrorCode.PLAY_ALREADY_COMPLETED })
      expect(playRepository.replaceScores).not.toHaveBeenCalled()
    })

    it('rejects a cell that is not in the score sheet', async () => {
      playRepository.findById.mockResolvedValue(play())

      const code = await codeOf(
        saveScores.execute(
          new SavePlayScoresCommand({
            userId,
            playId,
            language: 'fr',
            scores: [{ side: 0, rowKey: TOTAL_SCORE_KEY, round: 0, value: 1 }],
          }),
        ),
      )

      expect(code).toBe(ErrorCode.INVALID_PLAY_SCORES)
      expect(playRepository.replaceScores).not.toHaveBeenCalled()
    })
  })

  describe('CompletePlayHandler', () => {
    it('designates the sides ranked first', async () => {
      playRepository.findById.mockResolvedValue(
        play({
          scores: [
            { side: 0, rowKey: ROUND_SCORE_KEY, round: 1, value: 12 },
            { side: 1, rowKey: ROUND_SCORE_KEY, round: 1, value: 7 },
          ],
        }),
      )

      await complete.execute(
        new CompletePlayCommand({
          userId,
          playId,
          language: 'fr',
          winnerSides: null,
        }),
      )

      expect(playRepository.complete).toHaveBeenCalledWith(
        playId,
        expect.any(Date),
        [1],
      )
    })

    it('keeps the chosen winners and the first completion date', async () => {
      const completedAt = new Date('2026-11-10T22:00:00.000Z')
      playRepository.findById.mockResolvedValue(
        play({ status: 'completed', completedAt }),
      )

      await complete.execute(
        new CompletePlayCommand({
          userId,
          playId,
          language: 'fr',
          winnerSides: [0, 1],
        }),
      )

      expect(playRepository.complete).toHaveBeenCalledWith(
        playId,
        completedAt,
        [0, 1],
      )
    })

    it('needs the winners of a manual outcome', async () => {
      playRepository.findById.mockResolvedValue(play({ scoring: manual }))

      const error = await complete
        .execute(
          new CompletePlayCommand({
            userId,
            playId,
            language: 'fr',
            winnerSides: null,
          }),
        )
        .catch((caught: unknown) => caught)

      expect(error).toBeInstanceOf(BusinessRuleError)
      expect(error).toMatchObject({ code: ErrorCode.INVALID_PLAY_WINNERS })
      expect(playRepository.complete).not.toHaveBeenCalled()
    })

    it('accepts no winner (lost cooperative game)', async () => {
      playRepository.findById.mockResolvedValue(
        play({
          scoring: { ...manual, sides: 'cooperative' },
          players: [player(0), player(0, { id: 'p2' })],
        }),
      )

      await complete.execute(
        new CompletePlayCommand({
          userId,
          playId,
          language: 'fr',
          winnerSides: [],
        }),
      )

      expect(playRepository.complete).toHaveBeenCalledWith(
        playId,
        expect.any(Date),
        [],
      )
    })

    it('rejects a winner side that does not exist', async () => {
      playRepository.findById.mockResolvedValue(play())

      const code = await codeOf(
        complete.execute(
          new CompletePlayCommand({
            userId,
            playId,
            language: 'fr',
            winnerSides: [5],
          }),
        ),
      )

      expect(code).toBe(ErrorCode.INVALID_PLAY_WINNERS)
    })
  })

  describe('ReopenPlayHandler', () => {
    it('puts a completed play back in progress', async () => {
      playRepository.findById.mockResolvedValue(play({ status: 'completed' }))

      await reopen.execute(
        new ReopenPlayCommand({ userId, playId, language: 'fr' }),
      )

      expect(playRepository.reopen).toHaveBeenCalledWith(playId)
    })

    it('leaves a play in progress untouched', async () => {
      const current = play()
      playRepository.findById.mockResolvedValue(current)

      const result = await reopen.execute(
        new ReopenPlayCommand({ userId, playId, language: 'fr' }),
      )

      expect(result).toBe(current)
      expect(playRepository.reopen).not.toHaveBeenCalled()
    })
  })

  describe('UpdatePlayHandler', () => {
    it('updates the fields sent', async () => {
      playRepository.findById.mockResolvedValue(play())

      await update.execute(
        new UpdatePlayCommand({ userId, playId, language: 'fr', note: null }),
      )

      expect(playRepository.updateDetails).toHaveBeenCalledWith(playId, {
        playedAt: undefined,
        note: null,
      })
    })

    it('does not write without changes but checks the owner', async () => {
      playRepository.findById.mockRejectedValue(
        new NotFoundError('Play not found', { code: ErrorCode.PLAY_NOT_FOUND }),
      )

      await expect(
        update.execute(
          new UpdatePlayCommand({ userId, playId, language: 'fr' }),
        ),
      ).rejects.toBeInstanceOf(NotFoundError)
      expect(playRepository.updateDetails).not.toHaveBeenCalled()
    })
  })

  it('deletes a play of the user', async () => {
    await remove.execute(new DeletePlayCommand({ userId, playId }))

    expect(playRepository.softDelete).toHaveBeenCalledWith(playId, userId)
  })

  it('gets a play of the user', async () => {
    const current = play()
    playRepository.findById.mockResolvedValue(current)

    await expect(
      get.execute(new GetPlayQuery({ userId, playId, language: 'en' })),
    ).resolves.toBe(current)
    expect(playRepository.findById).toHaveBeenCalledWith(playId, userId, 'en')
  })

  it('lists the plays of a game', async () => {
    playRepository.listByUser.mockResolvedValue([])

    await list.execute(
      new ListPlaysQuery({ userId, language: 'fr', gameId, limit: 20 }),
    )

    expect(playRepository.listByUser).toHaveBeenCalledWith(userId, 'fr', {
      gameId,
      status: null,
      updatedSince: null,
      limit: 20,
      offset: 0,
    })
  })
})
