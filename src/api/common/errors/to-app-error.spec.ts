import { NotFoundException } from '@nestjs/common'
import { ThrottlerException } from '@nestjs/throttler'
import {
  BadRequestError,
  ErrorCode,
  InternalError,
  NotFoundError,
  TooManyRequestsError,
} from '@/shared/errors'
import { toAppError } from './to-app-error'

describe('toAppError', () => {
  it('returns an AppError untouched', () => {
    const error = new NotFoundError('missing')
    expect(toAppError(error)).toBe(error)
  })

  it('maps Nest HTTP exceptions by status', () => {
    expect(toAppError(new NotFoundException())).toBeInstanceOf(NotFoundError)
    expect(toAppError(new ThrottlerException())).toBeInstanceOf(
      TooManyRequestsError,
    )
  })

  it('maps Fastify errors carrying a statusCode', () => {
    const fastifyError = Object.assign(new SyntaxError('Unexpected token'), {
      statusCode: 400,
    })
    const error = toAppError(fastifyError)
    expect(error).toBeInstanceOf(BadRequestError)
    expect(error.cause).toBe(fastifyError)
  })

  it('turns anything else into an InternalError keeping the cause', () => {
    const cause = new TypeError('undefined is not a function')
    const error = toAppError(cause)
    expect(error).toBeInstanceOf(InternalError)
    expect(error.code).toBe(ErrorCode.INTERNAL_SERVER_ERROR)
    expect(error.cause).toBe(cause)
    expect(toAppError('string thrown').message).toBe('Unknown error')
  })
})
