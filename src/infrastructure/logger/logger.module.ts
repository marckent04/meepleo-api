import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino'
import { stdSerializers } from 'pino'
import {
  APP_CONFIG,
  type AppConfig,
  LOGGER_CONFIG,
  type LoggerConfig,
  type LogLevel,
} from '@/shared/config'
import { resolveCorrelationId } from './correlation-id.util'
import { LoggerService } from './logger.service'

/** Correspondance niveaux pino → `severity` Google Cloud Logging. */
const SEVERITY: Record<LogLevel, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
}

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule.forFeature(LOGGER_CONFIG)],
      inject: [APP_CONFIG.KEY, LOGGER_CONFIG.KEY],
      useFactory: (app: AppConfig, loggerConfig: LoggerConfig) => ({
        pinoHttp: {
          // All levels reach the hook, which only keeps LOG_LEVELS.
          level: 'trace',
          autoLogging: false,
          messageKey: 'message',
          genReqId: resolveCorrelationId,
          customAttributeKeys: { reqId: 'correlationId' },
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          serializers: { err: stdSerializers.errWithCause },
          formatters: {
            level: (label: string) => ({
              level: label,
              severity: SEVERITY[label as LogLevel] ?? 'DEFAULT',
            }),
          },
          hooks: {
            logMethod(args, method, level) {
              const label = this.levels.labels[level] as LogLevel
              if (loggerConfig.levels.has(label)) {
                method.apply(this, args)
              }
            },
          },
          // Readable locally; raw JSON elsewhere (production, tests, CI).
          transport:
            app.nodeEnv === 'development'
              ? {
                  target: 'pino-pretty',
                  options: { singleLine: true, messageKey: 'message' },
                }
              : undefined,
        },
      }),
    }),
  ],
  providers: [LoggerService],
  exports: [LoggerService],
})
export class AppLoggerModule {}
