import { ValidationError } from 'class-validator'
import { toErrorFields } from './validation-fields'

function validationError(
  property: string,
  constraints?: Record<string, string>,
  children: ValidationError[] = [],
): ValidationError {
  return Object.assign(new ValidationError(), {
    property,
    constraints,
    children,
  })
}

describe('toErrorFields', () => {
  it('flattens nested errors with dotted paths', () => {
    const errors = [
      validationError('email', { isEmail: 'email must be an email' }),
      validationError('items', undefined, [
        validationError('0', undefined, [
          validationError('name', {
            isString: 'name must be a string',
            isNotEmpty: 'name should not be empty',
          }),
        ]),
      ]),
    ]

    expect(toErrorFields(errors)).toEqual([
      { field: 'email', constraint: 'isEmail' },
      { field: 'items.0.name', constraint: 'isString' },
      { field: 'items.0.name', constraint: 'isNotEmpty' },
    ])
  })
})
