import { ConsoleLogger, VersioningType } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { type NestNodeApplication, NodeAdapter } from '@nestjs/platform-node'
import { useContainer } from 'class-validator'
import { Logger as PinoNestLogger } from 'nestjs-pino'
import { AppModule } from './app.module'
import { APP_CONFIG, type AppConfig } from './shared/config'

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestNodeApplication>(
    AppModule,
    new NodeAdapter({ trustProxy: true }),
    {
      bufferLogs: true,
      // The error bubbles up to the catch below instead of an immediate process.exit.
      abortOnError: false,
      logger: new ConsoleLogger({ json: true, colors: false }),
    },
  )
  app.useLogger(app.get(PinoNestLogger))
  // Allows injecting services into custom class-validator constraints.
  useContainer(app.select(AppModule), { fallbackOnErrors: true })
  app.enableVersioning({ type: VersioningType.URI })
  app.enableCors()
  app.enableShutdownHooks()

  const appConfig = app.get<AppConfig>(APP_CONFIG.KEY)
  if (appConfig.nodeEnv !== 'production') {
    // Dynamic import: the doc generation is never loaded in production.
    const { setupSwagger } = await import('./api/rest/swagger')
    setupSwagger(app, appConfig.version)
  }

  await app.listen(appConfig.port, '0.0.0.0')
}

// Text logger (not JSON): a Zod config error stays readable.
const bootstrapLogger = new ConsoleLogger('Bootstrap')

bootstrap().catch((error: unknown) => {
  bootstrapLogger.fatal(error instanceof Error ? error.message : error)
  if (error instanceof Error && error.stack) bootstrapLogger.debug(error.stack)
  process.exit(1)
})
