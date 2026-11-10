import { VersioningType } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import type { MockInstance } from 'vitest'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import { AppModule } from '@/app.module'
import { GetGameScoringTemplateQuery } from '@/domain/game'
import {
  CompletePlayCommand,
  CreatePlayCommand,
  ListPlaysQuery,
  SavePlayScoresCommand,
  UpdatePlayCommand,
} from '@/domain/play'
import { TokenService } from '@/infrastructure/adapters/auth'
import { PrismaService } from '@/infrastructure/database/prisma.service'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { BusinessRuleError, ConflictError, ErrorCode } from '@/shared/errors'
import {
  DEFAULT_SCORING_TEMPLATE,
  type Play,
  ROUND_SCORE_KEY,
  type ScoringTemplate,
} from '@/shared/types'

const userId = '0195d1a2-0000-7000-8000-000000000001'
const gameId = '0195d1a2-0000-7000-8000-000000000002'
const playId = '0195d1a2-0000-7000-8000-000000000003'
const playerId = '0195d1a2-0000-7000-8000-000000000004'

const sixNimmt: ScoringTemplate = {
  ...DEFAULT_SCORING_TEMPLATE,
  outcome: 'lowest',
  rounds: { count: null },
  targetScore: 66,
}

const play: Play = {
  id: playId,
  game: { id: gameId, name: '6 qui prend !', imageUrl: null },
  status: 'in_progress',
  playedAt: new Date('2026-11-10T20:00:00.000Z'),
  completedAt: null,
  note: null,
  players: [
    {
      id: playerId,
      userId,
      name: 'Marc',
      side: 0,
      total: 12,
      rank: 1,
      isWinner: false,
    },
  ],
  scoring: sixNimmt,
  scores: [{ side: 0, rowKey: ROUND_SCORE_KEY, round: 1, value: 12 }],
}

describe('/v1/plays (integration)', () => {
  let app: NestFastifyApplication
  let commandExecute: MockInstance<CommandBus['execute']>
  let queryExecute: MockInstance<QueryBus['execute']>
  let headers: Record<string, string>

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('DATABASE_URL', 'postgresql://app:app@localhost:5432/app')
    vi.stubEnv('LOG_LEVELS', 'fatal')
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    vi.stubEnv('JWT_ACCESS_SECRET', 'a'.repeat(32))
    vi.stubEnv('JWT_REFRESH_SECRET', 'b'.repeat(32))

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $connect: vi.fn(), $disconnect: vi.fn() })
      .overrideProvider(LoggerService)
      .useValue(mockLoggerService)
      .compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    )
    app.enableVersioning({ type: VersioningType.URI })
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    commandExecute = vi.spyOn(app.get(CommandBus), 'execute')
    queryExecute = vi.spyOn(app.get(QueryBus), 'execute')
    const { token } = await app.get(TokenService).signAccessToken(userId)
    headers = { 'accept-language': 'fr', authorization: `Bearer ${token}` }
  })

  afterAll(async () => {
    await app.close()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['GET', '/v1/plays'],
    ['POST', '/v1/plays'],
    ['GET', `/v1/plays/${playId}`],
    ['PUT', `/v1/plays/${playId}/scores`],
    ['DELETE', `/v1/plays/${playId}`],
  ] as const)('%s %s returns 401 without a token', async (method, url) => {
    const response = await app.inject({
      method,
      url,
      headers: { 'accept-language': 'fr' },
    })

    expect(response.statusCode).toBe(401)
    expect(commandExecute).not.toHaveBeenCalled()
    expect(queryExecute).not.toHaveBeenCalled()
  })

  it('GET /v1/games/:id/scoring returns the template without a token', async () => {
    queryExecute.mockResolvedValue(sixNimmt)

    const response = await app.inject({
      method: 'GET',
      url: `/v1/games/${gameId}/scoring`,
      headers: { 'accept-language': 'en' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(sixNimmt)
    expect(queryExecute).toHaveBeenCalledWith(
      new GetGameScoringTemplateQuery({ gameId, language: 'en' }),
    )
  })

  it('POST creates a play and returns 201', async () => {
    commandExecute.mockResolvedValue(play)

    const response = await app.inject({
      method: 'POST',
      url: '/v1/plays',
      headers,
      payload: {
        gameId,
        playedAt: '2026-11-10T21:00:00+01:00',
        note: '  ',
        players: [
          { name: ' Marc ', side: 0, isCurrentUser: true },
          { name: 'Léa', side: 1 },
        ],
        sides: 'individual',
      },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      id: playId,
      status: 'in_progress',
      playedAt: '2026-11-10T20:00:00.000Z',
      completedAt: null,
      scoring: sixNimmt,
      players: [{ id: playerId, total: 12, rank: 1 }],
    })
    expect(commandExecute).toHaveBeenCalledWith(
      new CreatePlayCommand({
        userId,
        gameId,
        language: 'fr',
        playedAt: new Date('2026-11-10T20:00:00.000Z'),
        note: null,
        players: [
          { name: 'Marc', side: 0, isCurrentUser: true },
          { name: 'Léa', side: 1, isCurrentUser: false },
        ],
        scoring: null,
        sides: 'individual',
      }),
    )
  })

  it('POST returns 400 without players', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/plays',
      headers,
      payload: { gameId, players: [] },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().code).toBe(ErrorCode.VALIDATION_FAILED)
    expect(commandExecute).not.toHaveBeenCalled()
  })

  it('POST returns 422 when the players do not match the sides', async () => {
    commandExecute.mockRejectedValue(
      new BusinessRuleError(ErrorCode.INVALID_PLAY_PLAYERS, 'Invalid sides'),
    )

    const response = await app.inject({
      method: 'POST',
      url: '/v1/plays',
      headers,
      payload: { gameId, players: [{ name: 'A', side: 1 }] },
    })

    expect(response.statusCode).toBe(422)
    expect(response.json().code).toBe(ErrorCode.INVALID_PLAY_PLAYERS)
  })

  it('GET lists the plays of a game', async () => {
    queryExecute.mockResolvedValue([play])

    const response = await app.inject({
      method: 'GET',
      url: `/v1/plays?gameId=${gameId}&limit=5`,
      headers,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()[0]).not.toHaveProperty('scores')
    expect(queryExecute).toHaveBeenCalledWith(
      new ListPlaysQuery({ userId, language: 'fr', gameId, limit: 5 }),
    )
  })

  it('PUT saves the score sheet', async () => {
    commandExecute.mockResolvedValue(play)
    const scores = [{ side: 0, rowKey: ROUND_SCORE_KEY, round: 1, value: 12 }]

    const response = await app.inject({
      method: 'PUT',
      url: `/v1/plays/${playId}/scores`,
      headers,
      payload: { scores },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().scores).toEqual(scores)
    expect(commandExecute).toHaveBeenCalledWith(
      new SavePlayScoresCommand({ userId, playId, language: 'fr', scores }),
    )
  })

  it('PUT returns 409 PLAY_ALREADY_COMPLETED on a completed play', async () => {
    commandExecute.mockRejectedValue(
      new ConflictError('Completed', {
        code: ErrorCode.PLAY_ALREADY_COMPLETED,
      }),
    )

    const response = await app.inject({
      method: 'PUT',
      url: `/v1/plays/${playId}/scores`,
      headers,
      payload: { scores: [] },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json().code).toBe(ErrorCode.PLAY_ALREADY_COMPLETED)
  })

  it('PATCH clears the note and keeps the date', async () => {
    commandExecute.mockResolvedValue(play)

    const response = await app.inject({
      method: 'PATCH',
      url: `/v1/plays/${playId}`,
      headers,
      payload: { note: null },
    })

    expect(response.statusCode).toBe(200)
    expect(commandExecute).toHaveBeenCalledWith(
      new UpdatePlayCommand({ userId, playId, language: 'fr', note: null }),
    )
  })

  it.each([
    ['without winners', {}, null],
    ['with the chosen winners', { winnerSides: [0] }, [0]],
  ])('POST complete %s', async (_, payload, winnerSides) => {
    commandExecute.mockResolvedValue({ ...play, status: 'completed' })

    const response = await app.inject({
      method: 'POST',
      url: `/v1/plays/${playId}/complete`,
      headers,
      payload,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().status).toBe('completed')
    expect(commandExecute).toHaveBeenCalledWith(
      new CompletePlayCommand({ userId, playId, language: 'fr', winnerSides }),
    )
  })

  it('POST complete accepts a request without a body', async () => {
    commandExecute.mockResolvedValue({ ...play, status: 'completed' })

    const response = await app.inject({
      method: 'POST',
      url: `/v1/plays/${playId}/complete`,
      headers,
    })

    expect(response.statusCode).toBe(200)
    expect(commandExecute).toHaveBeenCalledWith(
      new CompletePlayCommand({
        userId,
        playId,
        language: 'fr',
        winnerSides: null,
      }),
    )
  })

  it('DELETE returns 204', async () => {
    commandExecute.mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/plays/${playId}`,
      headers,
    })

    expect(response.statusCode).toBe(204)
  })
})
