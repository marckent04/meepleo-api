import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { BadRequestError, ErrorCode } from '@/shared/errors'
import { parseLocale, SUPPORTED_LOCALES } from '@/shared/i18n/locale'
import type { LocalizedRequest } from '../decorators/language.decorator'
import { SKIP_ACCEPT_LANGUAGE } from '../decorators/skip-accept-language.decorator'

/**
 * Exige un en-tête Accept-Language contenant une langue supportée, sauf sur
 * les routes marquées `@SkipAcceptLanguage()`. La langue résolue est exposée
 * via `@Language()`.
 */
@Injectable()
export class AcceptLanguageGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true
    const skip = this.reflector.getAllAndOverride<boolean | undefined>(
      SKIP_ACCEPT_LANGUAGE,
      [context.getHandler(), context.getClass()],
    )
    if (skip) return true

    const request = context.switchToHttp().getRequest<LocalizedRequest>()
    const header = request.headers['accept-language']
    if (!header?.trim()) {
      throw new BadRequestError('Accept-Language header is required', {
        code: ErrorCode.LANGUAGE_REQUIRED,
      })
    }

    const locale = parseLocale(header)
    if (!locale) {
      throw new BadRequestError('No supported language in Accept-Language', {
        code: ErrorCode.UNSUPPORTED_LANGUAGE,
        details: { acceptLanguage: header },
        params: { supported: SUPPORTED_LOCALES.join(', ') },
      })
    }

    request.locale = locale
    return true
  }
}
