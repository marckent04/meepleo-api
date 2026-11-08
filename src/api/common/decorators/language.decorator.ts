import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { DEFAULT_LOCALE, type Locale, parseLocale } from '@/shared/i18n/locale'

/** Request whose language was resolved by AcceptLanguageGuard. */
export type LocalizedRequest = FastifyRequest & { locale?: Locale }

/** Request language, resolved and validated by AcceptLanguageGuard. */
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
