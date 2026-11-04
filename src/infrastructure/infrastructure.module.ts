import { Global, Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { CqrsModule } from '@nestjs/cqrs'
import { ClsPluginTransactional } from '@nestjs-cls/transactional'
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma'
import { ClsModule } from 'nestjs-cls'
import { APP_CONFIG } from '@/shared/config'
import { AdaptersModule } from './adapters/adapters.module'
import { DatabaseModule } from './database/database.module'
import { PrismaService } from './database/prisma.service'
import * as repositories from './database/repositories'
import { AppI18nModule } from './i18n/i18n.module'
import {
  CORRELATION_ID_KEY,
  resolveCorrelationId,
} from './logger/correlation-id.util'
import { AppLoggerModule } from './logger/logger.module'

const repositoryProviders = Object.values(repositories)

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [APP_CONFIG] }),
    CqrsModule.forRoot(),
    DatabaseModule,
    // Un seul ClsModule : correlation id du logger + propagation des transactions.
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        setup: (cls, req) => {
          cls.set(CORRELATION_ID_KEY, resolveCorrelationId(req))
        },
      },
      plugins: [
        new ClsPluginTransactional({
          imports: [DatabaseModule],
          adapter: new TransactionalAdapterPrisma({
            prismaInjectionToken: PrismaService,
          }),
        }),
      ],
    }),
    AppLoggerModule,
    AppI18nModule,
    AdaptersModule,
  ],
  providers: [...repositoryProviders],
  exports: [
    ...repositoryProviders,
    DatabaseModule,
    AdaptersModule,
    AppLoggerModule,
  ],
})
export class InfrastructureModule {}
