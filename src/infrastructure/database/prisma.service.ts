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

/** Seuil (ms) au-delà duquel une requête est loggée en debug en développement. */
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

  async onModuleInit(): Promise<void> {
    if (this.logSlowQueries) {
      // Les paramètres ne sont jamais loggés : ils peuvent contenir des secrets.
      this.$on('query', (event) => {
        if (event.duration > SLOW_QUERY_THRESHOLD_MS) {
          this.logger.debug(
            { durationMs: event.duration, query: event.query },
            'Slow Prisma query',
          )
        }
      })
    }
    await this.$connect()
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect()
  }
}
