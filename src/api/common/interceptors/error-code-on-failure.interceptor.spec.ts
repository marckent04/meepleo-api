import type { CallHandler, ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { lastValueFrom, of, throwError } from 'rxjs'
import { ErrorCode, NotFoundError } from '@/shared/errors'
import { ErrorCodeOnFailureInterceptor } from './error-code-on-failure.interceptor'

function contextWithCode(code?: ErrorCode): {
  context: ExecutionContext
  reflector: Reflector
} {
  const handler = () => undefined
  const reflector = new Reflector()
  vi.spyOn(reflector, 'get').mockReturnValue(code)
  const context = { getHandler: () => handler } as unknown as ExecutionContext
  return { context, reflector }
}

const failingWith = (error: unknown): CallHandler => ({
  handle: () => throwError(() => error),
})

describe('ErrorCodeOnFailureInterceptor', () => {
  it('passes through when the route has no failure code', async () => {
    const { context, reflector } = contextWithCode()
    const interceptor = new ErrorCodeOnFailureInterceptor(reflector)
    const result = interceptor.intercept(context, { handle: () => of('ok') })
    await expect(lastValueFrom(result)).resolves.toBe('ok')
  })

  it('replaces a generic internal error with the route code', async () => {
    const { context, reflector } = contextWithCode(
      ErrorCode.HEALTH_CHECK_FAILED,
    )
    const cause = new Error('db down')
    const interceptor = new ErrorCodeOnFailureInterceptor(reflector)

    await expect(
      lastValueFrom(interceptor.intercept(context, failingWith(cause))),
    ).rejects.toMatchObject({
      statusCode: 500,
      code: ErrorCode.HEALTH_CHECK_FAILED,
      cause,
    })
  })

  it('keeps client errors and specific codes untouched', async () => {
    const { context, reflector } = contextWithCode(
      ErrorCode.HEALTH_CHECK_FAILED,
    )
    const notFound = new NotFoundError('missing')
    const interceptor = new ErrorCodeOnFailureInterceptor(reflector)

    await expect(
      lastValueFrom(interceptor.intercept(context, failingWith(notFound))),
    ).rejects.toBe(notFound)
  })
})
