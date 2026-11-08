import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import * as authHandlers from './auth/handlers'
import * as catalogHandlers from './catalog/handlers'
import * as favoritesHandlers from './favorites/handlers'
import * as gameHandlers from './game/handlers'
import * as gameSagas from './game/sagas'
import * as gameSheetHandlers from './game-sheet/handlers'
import * as healthHandlers from './health/handlers'
import * as wishlistHandlers from './wishlist/handlers'

/**
 * Adding a handler = exporting it from its feature's `handlers` barrel;
 * a saga, from the `sagas` barrel.
 */
@Module({
  imports: [CqrsModule],
  providers: [
    ...Object.values(healthHandlers),
    ...Object.values(authHandlers),
    ...Object.values(catalogHandlers),
    ...Object.values(favoritesHandlers),
    ...Object.values(wishlistHandlers),
    ...Object.values(gameSheetHandlers),
    ...Object.values(gameHandlers),
    ...Object.values(gameSagas),
  ],
})
export class DomainModule {}
