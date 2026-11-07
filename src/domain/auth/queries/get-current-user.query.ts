import { Query } from '@nestjs/cqrs'
import { IsUUID } from 'class-validator'
import type { CurrentUser } from '@/shared/types'

/** Compte de l'utilisateur authentifié. */
export class GetCurrentUserQuery extends Query<CurrentUser> {
  @IsUUID()
  readonly userId: string

  constructor({ userId }: { userId: string }) {
    super()
    this.userId = userId
  }
}
