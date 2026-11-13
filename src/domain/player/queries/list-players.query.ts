import { Query } from '@nestjs/cqrs'
import { IsDate, IsOptional, IsUUID } from 'class-validator'
import type { Player } from '@/shared/types'

/** Players of a user; tombstones included when `updatedSince` is given. */
export class ListPlayersQuery extends Query<Player[]> {
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
