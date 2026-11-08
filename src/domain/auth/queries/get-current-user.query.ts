import { Query } from '@nestjs/cqrs'
import { IsUUID } from 'class-validator'
import type { CurrentUser } from '@/shared/types'

/** Account of the authenticated user. */
export class GetCurrentUserQuery extends Query<CurrentUser> {
  @IsUUID()
  readonly userId: string

  constructor({ userId }: { userId: string }) {
    super()
    this.userId = userId
  }
}
