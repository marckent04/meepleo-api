import { VersioningType } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import type { MockInstance } from 'vitest'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import { AppModule } from '@/app.module'
import { RequestGameSheetCommand } from '@/domain/game'
import { PrismaService } from '@/infrastructure/database/prisma.service'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { ErrorCode, InternalError } from '@/shared/errors'
import { GameSheet } from '@/shared/types'

const gameId = '0195d1a2-0000-7000-8000-000000000001'
const url = `/v1/games/${gameId}`
const headers = { 'accept-language': 'fr' }

const sheet = new GameSheet(
  gameId,
  'fr',
  {
    localizedName: 'Dnup',
    edition: null,
    publisher: null,
    ruleBookUrl: null,
    imageUrl: null,
  },
  { min: 2, max: 5 },
  8,
  { min: 15, max: null },
  'Un jeu de cartes.',
  [],
  { summary: 'Jouez une carte.', steps: [] },
  [],
  [],
  { triggers: [], timing: 'Fin du paquet.', scoring: [], winner: [] },
  'high',
  [],
  [],
  'claude-haiku-5-5',
  new Date('2026-11-06T12:00:00.000Z'),
)

describe('GET /v1/games/:id (integration)', () => {
  let app: NestFastifyApplication
  let execute: MockInstance<CommandBus['execute']>

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
    // The controller is tested alone: the domain has its own tests.
    execute = vi.spyOn(app.get(CommandBus), 'execute')
  })

  afterAll(async () => {
    await app.close()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 with the sheet when it is ready', async () => {
    execute.mockResolvedValue({ status: 'ready', sheet })

    const response = await app.inject({ method: 'GET', url, headers })

    expect(response.statusCode).toBe(200)
    expect(response.headers['retry-after']).toBeUndefined()
    expect(response.json()).toMatchObject({
      gameId,
      language: 'fr',
      game: { localizedName: 'Dnup' },
      generatedAt: '2026-11-06T12:00:00.000Z',
    })
    expect(response.json()).not.toHaveProperty('status')
    expect(execute).toHaveBeenCalledWith(
      new RequestGameSheetCommand({ gameId, language: 'fr' }),
    )
  })

  it('returns 202 with Retry-After while the sheet is being aggregated', async () => {
    execute.mockResolvedValue({ status: 'pending', job: null })

    const response = await app.inject({ method: 'GET', url, headers })

    expect(response.statusCode).toBe(202)
    expect(response.headers['retry-after']).toBe('5')
    expect(response.json()).toEqual({ status: 'pending', retryAfterSeconds: 5 })
  })

  it('returns 500 GAME_SHEET_GENERATION_FAILED after a recent failure', async () => {
    execute.mockRejectedValue(
      new InternalError('Game sheet aggregation failed recently', {
        code: ErrorCode.GAME_SHEET_GENERATION_FAILED,
      }),
    )

    const response = await app.inject({ method: 'GET', url, headers })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toMatchObject({
      code: 'GAME_SHEET_GENERATION_FAILED',
    })
  })
})
