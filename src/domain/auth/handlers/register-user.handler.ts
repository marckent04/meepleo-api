import { CommandHandler } from '@nestjs/cqrs'
import { PasswordHasher } from '@/infrastructure/adapters/auth'
import { UserRepository } from '@/infrastructure/database/repositories'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { ConflictError, ErrorCode } from '@/shared/errors'
import type { User } from '@/shared/types'
import { AppCommandHandler } from '@/utils/cqrs.utils'
import { RegisterUserCommand } from '../commands'

@CommandHandler(RegisterUserCommand)
export class RegisterUserHandler extends AppCommandHandler<
  RegisterUserCommand,
  User
> {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    logger: LoggerService,
  ) {
    super(logger, 'user', RegisterUserCommand.name)
    this.logger.setContext(RegisterUserHandler.name)
  }

  async handle({
    email,
    username,
    password,
  }: RegisterUserCommand): Promise<User> {
    if (await this.userRepository.existsByEmail(email)) {
      throw new ConflictError('Email already used', {
        code: ErrorCode.EMAIL_ALREADY_USED,
      })
    }
    if (await this.userRepository.existsByUsername(username)) {
      throw new ConflictError('Username already used', {
        code: ErrorCode.USERNAME_ALREADY_USED,
      })
    }

    const passwordHash = await this.passwordHasher.hash(password)
    // Une inscription concurrente passe la vérification ci-dessus : la
    // contrainte d'unicité reste le dernier rempart (409 CONFLICT générique).
    return this.userRepository.create({ email, username, passwordHash })
  }
}
