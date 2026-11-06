import { Query } from '@nestjs/cqrs'
import { IsUUID } from 'class-validator'
import type { User } from '@/shared/types'

/** Compte de l'utilisateur authentifié. */
export class GetCurrentUserQuery extends Query<User> {
  @IsUUID()
  readonly userId: string

  constructor({ userId }: { userId: string }) {
    super()
    this.userId = userId
  }
}
