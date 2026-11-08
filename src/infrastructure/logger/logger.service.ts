import { Injectable, Scope } from '@nestjs/common'
import { ClsService } from 'nestjs-cls'
import { PinoLogger } from 'nestjs-pino'
import { CORRELATION_ID_KEY } from './correlation-id.util'

const LOG_FIELDS_KEY = 'logFields'

export type LogFields = Record<string, unknown>
/** Message, error (serialized as `err`) or structured fields. */
export type LogSubject = string | Error | LogFields

/**
 * Application logger: each log carries the context, the correlationId of the
 * current request (CLS) and the fields assigned via `assign()`.
 */
@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService {
  private context?: string

  constructor(private readonly cls: ClsService) {}

  setContext(context: string): void {
    this.context = context
  }

  /** Adds fields to all subsequent logs of the current request. */
  assign(fields: LogFields): void {
    if (!this.cls.isActive()) return
    this.cls.set(LOG_FIELDS_KEY, { ...this.requestFields(), ...fields })
  }

  trace(subject: LogSubject, message?: string): void {
    this.write('trace', subject, message)
  }

  debug(subject: LogSubject, message?: string): void {
    this.write('debug', subject, message)
  }

  info(subject: LogSubject, message?: string): void {
    this.write('info', subject, message)
  }

  warn(subject: LogSubject, message?: string): void {
    this.write('warn', subject, message)
  }

  error(subject: LogSubject, message?: string): void {
    this.write('error', subject, message)
  }

  fatal(subject: LogSubject, message?: string): void {
    this.write('fatal', subject, message)
  }

  private write(
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal',
    subject: LogSubject,
    message?: string,
  ): void {
    const bindings: LogFields = {
      ...(this.context ? { context: this.context } : {}),
      ...this.requestFields(),
    }
    // Root logger: request bindings come from CLS (not from
    // pino-http) so it also works outside HTTP (cls.run in a script).
    const logger = PinoLogger.root
    if (typeof subject === 'string') {
      logger[level](bindings, subject)
    } else if (subject instanceof Error) {
      logger[level]({ ...bindings, err: subject }, message ?? subject.message)
    } else {
      logger[level]({ ...bindings, ...subject }, message)
    }
  }

  private requestFields(): LogFields {
    if (!this.cls.isActive()) return {}
    const correlationId = this.cls.get<string | undefined>(CORRELATION_ID_KEY)
    return {
      ...(correlationId ? { correlationId } : {}),
      ...(this.cls.get<LogFields | undefined>(LOG_FIELDS_KEY) ?? {}),
    }
  }
}
