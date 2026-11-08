import type { I18nService } from 'nestjs-i18n'
import type { AppError } from '@/shared/errors'
import { genericErrorCodeForStatus, isErrorCode } from '@/shared/errors'
import type { Locale } from '@/shared/i18n/locale'

export type ErrorTranslator = {
  /** Translated message for the error code (falls back to the generic status code). */
  error(error: AppError): string
  /** Translated message for a validation constraint (falls back to `validation.default`). */
  constraint(name: string): string
}

export function errorTranslator(
  i18n: I18nService,
  lang: Locale,
): ErrorTranslator {
  const translate = (key: string, args?: Record<string, unknown>) =>
    i18n.translate<string, string>(key, { lang, args })

  return {
    error(error) {
      const code = isErrorCode(error.code)
        ? error.code
        : genericErrorCodeForStatus(error.statusCode)
      return translate(`errors.${code}`, error.params)
    },
    constraint(name) {
      const key = `validation.${name}`
      const message = translate(key)
      return message === key ? translate('validation.default') : message
    },
  }
}
