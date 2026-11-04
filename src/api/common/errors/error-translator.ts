import type { I18nService } from 'nestjs-i18n'
import type { AppError } from '@/shared/errors'
import { genericErrorCodeForStatus, isErrorCode } from '@/shared/errors'
import type { Locale } from '@/shared/i18n/locale'

export type ErrorTranslator = {
  /** Message traduit du code de l'erreur (repli sur le code générique du statut). */
  error(error: AppError): string
  /** Message traduit d'une contrainte de validation (repli sur `validation.default`). */
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
