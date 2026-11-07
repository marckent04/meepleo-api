import { QueryHandler } from '@nestjs/cqrs'
import {
  UserFavoriteRepository,
  UserGameRepository,
  UserRepository,
} from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { UnauthenticatedError } from '@/shared/errors'
import type { CurrentUser } from '@/shared/types'
import { AppQueryHandler } from '@/utils/cqrs.utils'
import { GetCurrentUserQuery } from '../queries'

@QueryHandler(GetCurrentUserQuery)
export class GetCurrentUserHandler extends AppQueryHandler<
  GetCurrentUserQuery,
  CurrentUser
> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userGameRepository: UserGameRepository,
    private readonly userFavoriteRepository: UserFavoriteRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', GetCurrentUserQuery.name)
    this.logger.setContext(GetCurrentUserHandler.name)
  }

  async handle({ userId }: GetCurrentUserQuery): Promise<CurrentUser> {
    const user = await this.userRepository.findById(userId)
    // Compte supprimé alors que l'access token est encore valide.
    if (!user) throw new UnauthenticatedError('User no longer exists')
    const [catalogCount, wishlistCount, favoritesCount] = await Promise.all([
      this.userGameRepository.count(userId, 'owned'),
      this.userGameRepository.count(userId, 'wishlist'),
      this.userFavoriteRepository.count(userId),
    ])
    return { ...user, catalogCount, wishlistCount, favoritesCount }
  }
}
