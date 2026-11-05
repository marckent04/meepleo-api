import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import * as gameHandlers from './game/handlers'
import * as gameSheetHandlers from './game-sheet/handlers'
import * as healthHandlers from './health/handlers'

/** Ajouter un handler = l'exporter depuis le barrel `handlers` de sa feature. */
@Module({
  imports: [CqrsModule],
  providers: [
    ...Object.values(healthHandlers),
    ...Object.values(gameSheetHandlers),
    ...Object.values(gameHandlers),
  ],
})
export class DomainModule {}
