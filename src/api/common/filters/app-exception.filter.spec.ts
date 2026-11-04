import type { ArgumentsHost } from '@nestjs/common'
import type { ClsService } from 'nestjs-cls'
import type { I18nService } from 'nestjs-i18n'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import type { LoggerService } from '@/infrastructure/logger/logger.service'
import { ErrorCode, InternalError, NotFoundError } from '@/shared/errors'
import { AppExceptionFilter } from './app-exception.filter'

function setup(acceptLanguage?: string) {
  const reply = { status: vi.fn(), send: vi.fn() }
  reply.status.mockReturnValue(reply)
  const request = {
    method: 'GET',
    url: '/v1/things/1',
    headers: { 'accept-language': acceptLanguage },
  }
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => reply,
    }),
  } as unknown as ArgumentsHost
  const i18n = {
    translate: vi.fn(
      (key: string, options: { lang: string }) => `${options.lang}:${key}`,
    ),
  }
  const cls = { isActive: () => true, get: () => 'correlation-1' }
  const filter = new AppExceptionFilter(
    mockLoggerService as unknown as LoggerService,
    i18n as unknown as I18nService,
    cls as unknown as ClsService,
  )
  return { filter, host, reply, i18n }
}

describe('AppExceptionFilter', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('responds with the real status and a translated body', () => {
    const { filter, host, reply } = setup('en')

    filter.catch(new NotFoundError('Thing 1 not found'), host)

    expect(reply.status).toHaveBeenCalledWith(404)
    expect(reply.send).toHaveBeenCalledWith({
      code: ErrorCode.NOT_FOUND,
      message: 'en:errors.NOT_FOUND',
      correlationId: 'correlation-1',
    })
  })

  it('logs an expected error as a one-line warning', () => {
    const { filter, host } = setup()

    filter.catch(new NotFoundError('Thing 1 not found'), host)

    expect(mockLoggerService.warn).toHaveBeenCalledWith(
      expect.objectContaining({ code: ErrorCode.NOT_FOUND, statusCode: 404 }),
      'NotFoundError: Thing 1 not found',
    )
    expect(mockLoggerService.error).not.toHaveBeenCalled()
  })

  it('logs an unexpected error with its cause and redacted details', () => {
    const { filter, host, reply } = setup('fr')
    const error = new InternalError('boom', {
      details: { password: 'hunter2', id: 1 },
    })

    filter.catch(error, host)

    expect(mockLoggerService.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: error,
        details: { password: '[REDACTED]', id: 1 },
      }),
    )
    expect(reply.status).toHaveBeenCalledWith(500)
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        code: ErrorCode.INTERNAL_SERVER_ERROR,
        message: 'fr:errors.INTERNAL_SERVER_ERROR',
      }),
    )
  })

  it('never leaks the raw message of a non-AppError', () => {
    const { filter, host, reply } = setup()

    filter.catch(new Error('SELECT * FROM secrets failed'), host)

    const body = reply.send.mock.calls[0][0]
    expect(JSON.stringify(body)).not.toContain('secrets')
    expect(body.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR)
  })
})
