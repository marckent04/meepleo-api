import { ConflictError, ErrorCode, NotFoundError } from '@/shared/errors'
import { BadRequestError } from '@/shared/errors/app-error'
import { Prisma } from './generated/prisma/client'
import { rethrowPrismaError } from './prisma-errors'

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('prisma error', {
    code,
    clientVersion: 'test',
    meta,
  })
}

function capture(run: () => never): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
}

describe('rethrowPrismaError', () => {
  it('maps P2002 to a ConflictError with the given code and target', () => {
    const error = capture(() =>
      rethrowPrismaError(knownError('P2002', { target: ['email'] }), {
        conflict: ErrorCode.CONFLICT,
      }),
    )
    expect(error).toBeInstanceOf(ConflictError)
    expect(error).toMatchObject({
      code: ErrorCode.CONFLICT,
      details: { target: ['email'] },
    })
  })

  it('reads the conflicting fields from a driver adapter error', () => {
    const error = capture(() =>
      rethrowPrismaError(
        knownError('P2002', {
          driverAdapterError: { cause: { constraint: { fields: ['email'] } } },
        }),
      ),
    )
    expect(error).toMatchObject({ details: { target: ['email'] } })
  })

  it('maps P2025 to a NotFoundError', () => {
    const error = capture(() =>
      rethrowPrismaError(knownError('P2025'), {
        notFound: ErrorCode.NOT_FOUND,
      }),
    )
    expect(error).toBeInstanceOf(NotFoundError)
    expect(error).toMatchObject({ code: ErrorCode.NOT_FOUND })
  })

  it('maps P2003 to a BadRequestError', () => {
    const error = capture(() =>
      rethrowPrismaError(knownError('P2003', { field_name: 'owner_id' })),
    )
    expect(error).toBeInstanceOf(BadRequestError)
    expect(error).toMatchObject({ details: { field: 'owner_id' } })
  })

  it('rethrows other errors untouched', () => {
    const unknownPrismaError = knownError('P1001')
    const plainError = new Error('boom')
    expect(capture(() => rethrowPrismaError(unknownPrismaError))).toBe(
      unknownPrismaError,
    )
    expect(capture(() => rethrowPrismaError(plainError))).toBe(plainError)
  })
})
