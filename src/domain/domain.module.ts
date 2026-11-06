import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import * as authHandlers from './auth/handlers'
import * as gameHandlers from './game/handlers'
import * as gameSagas from './game/sagas'
import * as gameSheetHandlers from './game-sheet/handlers'
import * as healthHandlers from './health/handlers'

/**
 * Ajouter un handler = l'exporter depuis le barrel `handlers` de sa feature ;
 * une saga, depuis le barrel `sagas`.
 */
@Module({
  imports: [CqrsModule],
  providers: [
    ...Object.values(healthHandlers),
    ...Object.values(authHandlers),
    ...Object.values(gameSheetHandlers),
    ...Object.values(gameHandlers),
    ...Object.values(gameSagas),
  ],
})
export class DomainModule {}
