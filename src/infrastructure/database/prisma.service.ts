import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common'
import type { ConfigType } from '@nestjs/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { APP_CONFIG } from '@/shared/config'
import { LoggerService } from '../logger/logger.service'
import { DATABASE_CONFIG } from './database.config'
import { type Prisma, PrismaClient } from './generated/prisma/client'

/** Threshold (ms) above which a query is logged at debug level in development. */
const SLOW_QUERY_THRESHOLD_MS = 200

type PrismaServiceOptions = Prisma.PrismaClientOptions & {
  log: { emit: 'event'; level: 'query' }[]
}

@Injectable()
export class PrismaService
  extends PrismaClient<PrismaServiceOptions>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logSlowQueries: boolean

  constructor(
    @Inject(DATABASE_CONFIG.KEY) config: ConfigType<typeof DATABASE_CONFIG>,
    @Inject(APP_CONFIG.KEY) app: ConfigType<typeof APP_CONFIG>,
    private readonly logger: LoggerService,
  ) {
    const logSlowQueries = app.nodeEnv === 'development'
    super({
      adapter: new PrismaPg({
        connectionString: config.url,
        max: config.poolMax,
      }),
      log: logSlowQueries ? [{ emit: 'event', level: 'query' }] : [],
    })
    this.logSlowQueries = logSlowQueries
    this.logger.setContext(PrismaService.name)
  }

  onModuleInit(): void {
    if (this.logSlowQueries) {
      // Parameters are never logged: they may contain secrets.
      this.$on('query', (event) => {
        if (event.duration > SLOW_QUERY_THRESHOLD_MS) {
          this.logger.debug(
            { durationMs: event.duration, query: event.query },
            'Slow Prisma query',
          )
        }
      })
    }
    // No blocking $connect(): the pg pool opens the connection on the first
    // request, which avoids a DB round trip during the Cloud Run cold start.
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
