import { Body, Controller, Post, VersioningType } from '@nestjs/common'
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import { AppModule } from '@/app.module'
import { PrismaService } from '@/infrastructure/database/prisma.service'
import { HealthRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'

const EchoSchema = z.strictObject({
  name: z.string().trim().min(1).describe('Nom'),
})
class EchoDto extends createZodDto(EchoSchema) {}

/** Route de test : vérifie la validation Zod de bout en bout. */
@Controller({ path: 'echo', version: '1' })
class EchoController {
  @Post()
  echo(@Body() body: EchoDto): EchoDto {
    return body
  }
}

describe('REST errors (integration)', () => {
  let app: NestFastifyApplication
  const healthRepository = { ping: vi.fn() }

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('DATABASE_URL', 'postgresql://app:app@localhost:5432/app')
    vi.stubEnv('LOG_LEVELS', 'fatal')
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [EchoController],
    })
      .overrideProvider(PrismaService)
      .useValue({ $connect: vi.fn(), $disconnect: vi.fn() })
      .overrideProvider(HealthRepository)
      .useValue(healthRepository)
      .overrideProvider(LoggerService)
      .useValue(mockLoggerService)
      .compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    )
    app.enableVersioning({ type: VersioningType.URI })
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })

  afterAll(async () => {
    await app.close()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('GET /v1/health returns 200 with the serialized status', async () => {
    healthRepository.ping.mockResolvedValue(undefined)

    const response = await app.inject({ method: 'GET', url: '/v1/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      status: 'ok',
      databaseLatencyMs: expect.any(Number),
      checkedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    })
  })

  it('GET /v1/health returns 500 HEALTH_CHECK_FAILED when the database is down', async () => {
    healthRepository.ping.mockRejectedValue(new Error('connection refused'))

    const response = await app.inject({ method: 'GET', url: '/v1/health' })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      code: 'HEALTH_CHECK_FAILED',
      message: 'Le service est momentanément indisponible.',
      correlationId: expect.any(String),
    })
  })

  it('returns 400 VALIDATION_FAILED with translated fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/echo',
      headers: { 'accept-language': 'fr' },
      payload: { name: '   ' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Certaines données envoyées sont invalides.',
      fields: [
        {
          field: 'name',
          message: 'Cette valeur est trop petite ou trop courte.',
        },
      ],
      correlationId: expect.any(String),
    })
  })

  it('returns 400 BAD_REQUEST on a malformed JSON body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/echo',
      headers: { 'content-type': 'application/json', 'accept-language': 'fr' },
      payload: '{"name":',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'BAD_REQUEST' })
  })

  it('returns 404 NOT_FOUND in French by default, in English on request', async () => {
    const fr = await app.inject({ method: 'GET', url: '/v1/unknown' })
    const en = await app.inject({
      method: 'GET',
      url: '/v1/unknown',
      headers: { 'accept-language': 'en-US,en;q=0.9' },
    })

    expect(fr.statusCode).toBe(404)
    expect(fr.json()).toMatchObject({
      code: 'NOT_FOUND',
      message: 'La ressource demandée est introuvable.',
    })
    expect(en.json()).toMatchObject({
      code: 'NOT_FOUND',
      message: 'The requested resource could not be found.',
    })
  })

  it('returns 400 UNSUPPORTED_LANGUAGE for an unsupported language', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/games/0195d1a2-0000-7000-8000-000000000001',
      headers: { 'accept-language': 'de' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      code: 'UNSUPPORTED_LANGUAGE',
      message:
        "Cette langue n'est pas prise en charge. Langues disponibles : fr, en.",
    })
  })

  it('echoes the incoming correlation id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/unknown',
      headers: { 'x-correlation-id': 'support-ticket-42' },
    })

    expect(response.json()).toMatchObject({
      correlationId: 'support-ticket-42',
    })
  })
})
