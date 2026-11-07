import { ConsoleLogger, VersioningType } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify'
import { useContainer } from 'class-validator'
import { Logger as PinoNestLogger } from 'nestjs-pino'
import { AppModule } from './app.module'
import { APP_CONFIG, type AppConfig } from './shared/config'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
    {
      bufferLogs: true,
      // L'erreur remonte au catch ci-dessous au lieu d'un process.exit immédiat.
      abortOnError: false,
      logger: new ConsoleLogger({ json: true, colors: false }),
    },
  )
  app.useLogger(app.get(PinoNestLogger))
  // Permet d'injecter des services dans les contraintes class-validator custom.
  useContainer(app.select(AppModule), { fallbackOnErrors: true })
  app.enableVersioning({ type: VersioningType.URI })
  app.enableCors()
  app.enableShutdownHooks()

  const appConfig = app.get<AppConfig>(APP_CONFIG.KEY)
  if (appConfig.nodeEnv !== 'production') {
    // Import dynamique : la génération de la doc n'est jamais chargée en production.
    const { setupSwagger } = await import('./api/rest/swagger')
    setupSwagger(app, appConfig.version)
  }

  await app.listen(appConfig.port, '0.0.0.0')
}

// Logger texte (non JSON) : une erreur de config Zod reste lisible.
const bootstrapLogger = new ConsoleLogger('Bootstrap')

bootstrap().catch((error: unknown) => {
  bootstrapLogger.fatal(error instanceof Error ? error.message : error)
  if (error instanceof Error && error.stack) bootstrapLogger.debug(error.stack)
  process.exit(1)
})
