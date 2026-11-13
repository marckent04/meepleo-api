import { VersioningType } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { type NestNodeApplication, NodeAdapter } from '@nestjs/platform-node'
import { Test } from '@nestjs/testing'
import type { MockInstance } from 'vitest'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import { AppModule } from '@/app.module'
import {
  AddGameToFavoritesCommand,
  ListFavoritesQuery,
  RemoveGameFromFavoritesCommand,
} from '@/domain/favorites'
import { TokenService } from '@/infrastructure/adapters/auth'
import { PrismaService } from '@/infrastructure/database/prisma.service'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { ErrorCode, NotFoundError } from '@/shared/errors'

const userId = '0195d1a2-0000-7000-8000-000000000001'
const gameId = '0195d1a2-0000-7000-8000-000000000002'

describe('/v1/favorites (integration)', () => {
  let app: NestNodeApplication
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

    app = moduleRef.createNestApplication<NestNodeApplication>(
      new NodeAdapter(),
    )
    app.enableVersioning({ type: VersioningType.URI })
    await app.init()
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
    ['GET', '/v1/favorites'],
    ['PUT', `/v1/favorites/games/${gameId}`],
    ['DELETE', `/v1/favorites/games/${gameId}`],
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

  it('GET returns the favorites of the current user', async () => {
    queryExecute.mockResolvedValue([
      {
        id: gameId,
        name: 'Catan',
        year: 1995,
        categories: ['strategy'],
        imageUrl: null,
        addedAt: new Date('2026-11-06T12:00:00.000Z'),
        updatedAt: new Date('2026-11-06T12:00:00.000Z'),
        deletedAt: null,
        revision: 1,
      },
    ])

    const response = await app.inject({
      method: 'GET',
      url: '/v1/favorites',
      headers,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([
      {
        id: gameId,
        name: 'Catan',
        year: 1995,
        categories: ['strategy'],
        imageUrl: null,
        addedAt: '2026-11-06T12:00:00.000Z',
        updatedAt: '2026-11-06T12:00:00.000Z',
        revision: 1,
      },
    ])
    expect(queryExecute).toHaveBeenCalledWith(
      new ListFavoritesQuery({ userId, language: 'fr' }),
    )
  })

  it('PUT returns 204 and adds the game', async () => {
    commandExecute.mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'PUT',
      url: `/v1/favorites/games/${gameId}`,
      headers,
    })

    expect(response.statusCode).toBe(204)
    expect(commandExecute).toHaveBeenCalledWith(
      new AddGameToFavoritesCommand({ userId, gameId }),
    )
  })

  it('PUT returns 404 GAME_NOT_FOUND for an unknown game', async () => {
    commandExecute.mockRejectedValue(
      new NotFoundError('Game not found', { code: ErrorCode.GAME_NOT_FOUND }),
    )

    const response = await app.inject({
      method: 'PUT',
      url: `/v1/favorites/games/${gameId}`,
      headers,
    })

    expect(response.statusCode).toBe(404)
    expect(response.json().code).toBe(ErrorCode.GAME_NOT_FOUND)
  })

  it('PUT returns 400 for an invalid game id', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/v1/favorites/games/not-a-uuid',
      headers,
    })

    expect(response.statusCode).toBe(400)
    expect(commandExecute).not.toHaveBeenCalled()
  })

  it('DELETE returns 204 and removes the game', async () => {
    commandExecute.mockResolvedValue(undefined)

    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/favorites/games/${gameId}`,
      headers,
    })

    expect(response.statusCode).toBe(204)
    expect(commandExecute).toHaveBeenCalledWith(
      new RemoveGameFromFavoritesCommand({ userId, gameId }),
    )
  })
})
