import { BadRequestError, ErrorCode, NotFoundError } from '@/shared/errors'
import type { ErrorTranslator } from '../../common/errors/error-translator'
import { formatRestError } from './format-rest-error'

const translator: ErrorTranslator = {
  error: (error) => `error:${error.code}`,
  constraint: (name) => `constraint:${name}`,
}

describe('formatRestError', () => {
  it('builds the body without fields', () => {
    expect(formatRestError(new NotFoundError(), translator, 'cid')).toEqual({
      code: ErrorCode.NOT_FOUND,
      message: 'error:NOT_FOUND',
      correlationId: 'cid',
    })
  })

  it('translates each invalid field', () => {
    const error = new BadRequestError('Validation failed', {
      code: ErrorCode.VALIDATION_FAILED,
      fields: [{ field: 'name', constraint: 'zod.too_small' }],
    })
    expect(formatRestError(error, translator, 'cid')).toEqual({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'error:VALIDATION_FAILED',
      fields: [{ field: 'name', message: 'constraint:zod.too_small' }],
      correlationId: 'cid',
    })
  })
})
