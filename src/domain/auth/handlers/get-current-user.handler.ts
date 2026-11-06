import { QueryHandler } from '@nestjs/cqrs'
import { UserRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { UnauthenticatedError } from '@/shared/errors'
import type { User } from '@/shared/types'
import { AppQueryHandler } from '@/utils/cqrs.utils'
import { GetCurrentUserQuery } from '../queries'

@QueryHandler(GetCurrentUserQuery)
export class GetCurrentUserHandler extends AppQueryHandler<
  GetCurrentUserQuery,
  User
> {
  constructor(
    private readonly userRepository: UserRepository,
    logger: LoggerService,
  ) {
    super(logger, 'user', GetCurrentUserQuery.name)
    this.logger.setContext(GetCurrentUserHandler.name)
  }

  async handle({ userId }: GetCurrentUserQuery): Promise<User> {
    const user = await this.userRepository.findById(userId)
    // Compte supprimé alors que l'access token est encore valide.
    if (!user) throw new UnauthenticatedError('User no longer exists')
    return user
  }
}
