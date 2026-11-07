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
import {
  LoginCommand,
  LogoutCommand,
  RefreshTokensCommand,
  RegisterUserCommand,
} from '@/domain/auth'
import { TokenService } from '@/infrastructure/adapters/auth'
import { PrismaService } from '@/infrastructure/database/prisma.service'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { ConflictError, ErrorCode, UnauthenticatedError } from '@/shared/errors'

const headers = { 'accept-language': 'fr' }
const user = {
  id: '0195d1a2-0000-7000-8000-000000000001',
  email: 'ada@example.com',
  username: 'ada',
  createdAt: new Date('2026-11-06T12:00:00.000Z'),
}
const tokens = { accessToken: 'a', refreshToken: 'r', expiresIn: 900 }

describe('/v1/auth (integration)', () => {
  let app: NestFastifyApplication
  let commandExecute: MockInstance<CommandBus['execute']>
  let queryExecute: MockInstance<QueryBus['execute']>

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
  })

  afterAll(async () => {
    await app.close()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /register', () => {
    const payload = {
      email: 'ada@example.com',
      username: 'ada',
      password: 'correct-horse',
    }

    it('returns 201 with the user and never the password', async () => {
      commandExecute.mockResolvedValue(user)

      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        headers,
        payload,
      })

      expect(response.statusCode).toBe(201)
      expect(response.json()).toEqual({
        id: user.id,
        email: 'ada@example.com',
        username: 'ada',
        createdAt: '2026-11-06T12:00:00.000Z',
      })
      expect(commandExecute).toHaveBeenCalledWith(
        new RegisterUserCommand(payload),
      )
    })

    it('returns 400 VALIDATION_FAILED on invalid fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        headers,
        payload: { email: 'nope', username: 'a', password: 'short' },
      })

      expect(response.statusCode).toBe(400)
      expect(response.json().code).toBe(ErrorCode.VALIDATION_FAILED)
      expect(
        response.json().fields.map((f: { field: string }) => f.field),
      ).toEqual(expect.arrayContaining(['email', 'username', 'password']))
      expect(commandExecute).not.toHaveBeenCalled()
    })

    it('returns 409 EMAIL_ALREADY_USED', async () => {
      commandExecute.mockRejectedValue(
        new ConflictError('Email already used', {
          code: ErrorCode.EMAIL_ALREADY_USED,
        }),
      )

      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        headers,
        payload,
      })

      expect(response.statusCode).toBe(409)
      expect(response.json().code).toBe(ErrorCode.EMAIL_ALREADY_USED)
    })
  })

  describe('POST /login', () => {
    it('returns 200 with the tokens', async () => {
      commandExecute.mockResolvedValue(tokens)

      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        headers,
        payload: { username: 'ada', password: 'pw' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual(tokens)
      expect(commandExecute).toHaveBeenCalledWith(
        new LoginCommand({ username: 'ada', password: 'pw' }),
      )
    })

    it('returns 401 INVALID_CREDENTIALS', async () => {
      commandExecute.mockRejectedValue(
        new UnauthenticatedError('Invalid credentials', {
          code: ErrorCode.INVALID_CREDENTIALS,
        }),
      )

      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        headers,
        payload: { username: 'ada', password: 'bad' },
      })

      expect(response.statusCode).toBe(401)
      expect(response.json().code).toBe(ErrorCode.INVALID_CREDENTIALS)
    })
  })

  describe('POST /refresh and /logout', () => {
    it('refresh returns the new tokens', async () => {
      commandExecute.mockResolvedValue(tokens)

      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/refresh',
        headers,
        payload: { refreshToken: 'old' },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual(tokens)
      expect(commandExecute).toHaveBeenCalledWith(
        new RefreshTokensCommand({ refreshToken: 'old' }),
      )
    })

    it('logout returns 204 without a bearer token', async () => {
      commandExecute.mockResolvedValue(undefined)

      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/logout',
        headers,
        payload: { refreshToken: 'old' },
      })

      expect(response.statusCode).toBe(204)
      expect(commandExecute).toHaveBeenCalledWith(
        new LogoutCommand({ refreshToken: 'old' }),
      )
    })
  })

  describe('GET /me', () => {
    it('returns 401 without a bearer token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers,
      })

      expect(response.statusCode).toBe(401)
      expect(response.json().code).toBe(ErrorCode.UNAUTHENTICATED)
      expect(queryExecute).not.toHaveBeenCalled()
    })

    it('returns 401 with a garbage token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: { ...headers, authorization: 'Bearer garbage' },
      })

      expect(response.statusCode).toBe(401)
    })

    it('returns the user for a valid access token', async () => {
      queryExecute.mockResolvedValue({
        ...user,
        catalogCount: 3,
        wishlistCount: 2,
        favoritesCount: 1,
      })
      const { token } = await app.get(TokenService).signAccessToken(user.id)

      const response = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: { ...headers, authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({
        username: 'ada',
        catalogCount: 3,
        wishlistCount: 2,
        favoritesCount: 1,
      })
    })

    it('does not accept a refresh token as an access token', async () => {
      const { token } = await app.get(TokenService).signRefreshToken(user.id)

      const response = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: { ...headers, authorization: `Bearer ${token}` },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  it('keeps the game routes public', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/games?search=ca',
      headers,
    })

    expect(response.statusCode).not.toBe(401)
  })
})
