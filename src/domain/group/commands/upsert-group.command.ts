import { Command } from '@nestjs/cqrs'
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDate,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator'
import type { Group, GroupWrite, LwwResult } from '@/shared/types'

export const GROUP_NAME_MAX_LENGTH = 60
export const GROUP_MAX_MEMBERS = 50

/**
 * Creates or modifies a group identified by a client-generated id (last write
 * wins on `updatedAt`). With `deletedAt`, deletes it (tombstone).
 */
export class UpsertGroupCommand extends Command<LwwResult<Group>> {
  @IsUUID()
  readonly userId: string

  @IsUUID()
  readonly id: string

  @IsString()
  @MaxLength(GROUP_NAME_MAX_LENGTH)
  @IsNotEmpty({ message: 'name should not be empty' })
  readonly name: string

  @IsArray()
  @ArrayMaxSize(GROUP_MAX_MEMBERS)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  readonly memberIds: string[]

  @IsDate()
  readonly createdAt: Date

  @IsDate()
  readonly updatedAt: Date

  @IsOptional()
  @IsDate()
  readonly deletedAt: Date | null

  constructor(
    params: Omit<GroupWrite, 'deletedAt'> & {
      userId: string
      deletedAt?: Date | null
    },
  ) {
    super()
    this.userId = params.userId
    this.id = params.id
    this.name = params.name
    this.memberIds = params.memberIds
    this.createdAt = params.createdAt
    this.updatedAt = params.updatedAt
    this.deletedAt = params.deletedAt ?? null
  }
}
