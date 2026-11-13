import { Query } from '@nestjs/cqrs'
import { IsDate, IsOptional, IsUUID } from 'class-validator'
import type { Group } from '@/shared/types'

/** Groups of a user; tombstones included when `updatedSince` is given. */
export class ListGroupsQuery extends Query<Group[]> {
  @IsUUID()
  readonly userId: string

  @IsOptional()
  @IsDate()
  readonly updatedSince: Date | null

  constructor({
    userId,
    updatedSince,
  }: {
    userId: string
    updatedSince?: Date | null
  }) {
    super()
    this.userId = userId
    this.updatedSince = updatedSince ?? null
  }
}
