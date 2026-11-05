import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import * as gameSheetHandlers from './game-sheet/handlers'
import * as healthHandlers from './health/handlers'

/** Ajouter un handler = l'exporter depuis le barrel `handlers` de sa feature. */
@Module({
  imports: [CqrsModule],
  providers: [
    ...Object.values(healthHandlers),
    ...Object.values(gameSheetHandlers),
  ],
})
export class DomainModule {}
