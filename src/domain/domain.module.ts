import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import * as healthHandlers from './health/handlers'

/** Ajouter un handler = l'exporter depuis le barrel `handlers` de sa feature. */
@Module({
  imports: [CqrsModule],
  providers: [...Object.values(healthHandlers)],
})
export class DomainModule {}
