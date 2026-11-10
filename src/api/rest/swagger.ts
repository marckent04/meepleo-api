import type { NestNodeApplication } from '@nestjs/platform-node'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { cleanupOpenApiDoc } from 'nestjs-zod'

/** UI at /docs, JSON at /docs-json. Served outside production only. */
export function setupSwagger(app: NestNodeApplication, version: string): void {
  const config = new DocumentBuilder()
    .setTitle('Meepleo API')
    .setVersion(version)
    .addBearerAuth()
    .build()
  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('docs', app, cleanupOpenApiDoc(document))
}
