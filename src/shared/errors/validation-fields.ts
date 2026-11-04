import type { ValidationError } from 'class-validator'
import type { ErrorField } from './app-error'

/**
 * Aplatit les ValidationError class-validator (imbriquées) en
 * `{ field: 'a.0.b', constraint: 'isEmail' }[]`.
 */
export function toErrorFields(
  errors: ValidationError[],
  parentPath?: string,
): ErrorField[] {
  return errors.flatMap((error) => {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property
    const own = Object.keys(error.constraints ?? {}).map((constraint) => ({
      field,
      constraint,
    }))
    return [...own, ...toErrorFields(error.children ?? [], field)]
  })
}
