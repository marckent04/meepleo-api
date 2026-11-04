import { BusinessRuleError, InternalError, NotFoundError } from './app-error'
import {
  ErrorCode,
  genericErrorCodeForStatus,
  isErrorCode,
} from './error-codes'

describe('AppError', () => {
  it('uses the default code and exposes public extensions with the code', () => {
    const error = new NotFoundError('Project 42 not found', {
      extensions: { resource: 'project' },
    })
    expect(error).toMatchObject({
      name: 'NotFoundError',
      statusCode: 404,
      code: ErrorCode.NOT_FOUND,
      expected: true,
      message: 'Project 42 not found',
    })
    expect(error.extensions).toEqual({
      resource: 'project',
      code: ErrorCode.NOT_FOUND,
    })
  })

  it('keeps a specific code and the cause', () => {
    const cause = new Error('db down')
    const error = new InternalError(undefined, {
      code: ErrorCode.HEALTH_CHECK_FAILED,
      cause,
    })
    expect(error.code).toBe(ErrorCode.HEALTH_CHECK_FAILED)
    expect(error.expected).toBe(false)
    expect(error.cause).toBe(cause)
    expect(error.message).toBe('Internal server error')
  })

  it('builds a 422 business rule error from a code', () => {
    const error = new BusinessRuleError(
      ErrorCode.UNPROCESSABLE_ENTITY,
      'Rule broken',
    )
    expect(error.statusCode).toBe(422)
    expect(error.code).toBe(ErrorCode.UNPROCESSABLE_ENTITY)
  })
})

describe('error codes', () => {
  it('recognises catalogued codes only', () => {
    expect(isErrorCode('NOT_FOUND')).toBe(true)
    expect(isErrorCode('toString')).toBe(false)
    expect(isErrorCode(42)).toBe(false)
  })

  it.each([
    [400, ErrorCode.BAD_REQUEST],
    [401, ErrorCode.UNAUTHENTICATED],
    [403, ErrorCode.FORBIDDEN],
    [404, ErrorCode.NOT_FOUND],
    [409, ErrorCode.CONFLICT],
    [422, ErrorCode.UNPROCESSABLE_ENTITY],
    [429, ErrorCode.TOO_MANY_REQUESTS],
    [418, ErrorCode.BAD_REQUEST],
    [503, ErrorCode.INTERNAL_SERVER_ERROR],
  ])('maps status %i to %s', (status, code) => {
    expect(genericErrorCodeForStatus(status)).toBe(code)
  })
})
