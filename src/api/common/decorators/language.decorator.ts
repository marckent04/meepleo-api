import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { DEFAULT_LOCALE, type Locale, parseLocale } from '@/shared/i18n/locale'

/** Requête dont la langue a été résolue par AcceptLanguageGuard. */
export type LocalizedRequest = FastifyRequest & { locale?: Locale }

/** Langue de la requête, résolue et validée par AcceptLanguageGuard. */
export const Language = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Locale => {
    const request = context.switchToHttp().getRequest<LocalizedRequest>()
    return (
      request.locale ??
      parseLocale(request.headers['accept-language']) ??
      DEFAULT_LOCALE
    )
  },
)
