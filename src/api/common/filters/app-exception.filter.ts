import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common'
import type { NodeRequest, NodeResponse } from '@nestjs/platform-node'
import { ClsService } from 'nestjs-cls'
import { I18nService } from 'nestjs-i18n'
import { CORRELATION_ID_KEY } from '@/infrastructure/logger/correlation-id.util'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { redactSecrets } from '@/infrastructure/logger/redact.util'
import type { AppError } from '@/shared/errors'
import { resolveLocale } from '@/shared/i18n/locale'
import { formatRestError } from '../../rest/errors/format-rest-error'
import { errorTranslator } from '../errors/error-translator'
import { toAppError } from '../errors/to-app-error'

/**
 * Only place that logs an error thrown during a request, then responds
 * with the real HTTP status and a translated ErrorResponse body.
 */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly logger: LoggerService,
    private readonly i18n: I18nService,
    private readonly cls: ClsService,
  ) {
    this.logger.setContext(AppExceptionFilter.name)
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp()
    const request = http.getRequest<NodeRequest>()
    const reply = http.getResponse<NodeResponse>()
    const error = toAppError(exception)

    this.log(error, request)

    const translator = errorTranslator(
      this.i18n,
      resolveLocale(request.headers['accept-language']),
    )
    const correlationId = this.cls.isActive()
      ? (this.cls.get<string | undefined>(CORRELATION_ID_KEY) ?? '')
      : ''
    reply
      .status(error.statusCode)
      .send(formatRestError(error, translator, correlationId))
  }

  private log(error: AppError, request: NodeRequest): void {
    const fields = {
      code: error.code,
      statusCode: error.statusCode,
      method: request.method,
      url: request.url,
    }
    if (error.expected) {
      this.logger.warn(fields, `${error.name}: ${error.message}`)
      return
    }
    this.logger.error({
      ...fields,
      err: error,
      details: error.details ? redactSecrets(error.details) : undefined,
    })
  }
}
