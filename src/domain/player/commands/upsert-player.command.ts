import { Command } from '@nestjs/cqrs'
import {
  IsBoolean,
  IsDate,
  IsHexColor,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator'
import {
  type LwwResult,
  PLAYER_SHAPES,
  type Player,
  type PlayerShape,
  type PlayerWrite,
} from '@/shared/types'

export const PLAYER_NAME_MAX_LENGTH = 40

/**
 * Creates or modifies a player identified by a client-generated id (last write
 * wins on `updatedAt`). With `deletedAt`, deletes it (tombstone).
 */
export class UpsertPlayerCommand extends Command<LwwResult<Player>> {
  @IsUUID()
  readonly userId: string

  @IsUUID()
  readonly id: string

  @IsString()
  @MaxLength(PLAYER_NAME_MAX_LENGTH)
  @IsNotEmpty({ message: 'name should not be empty' })
  readonly name: string

  @IsHexColor()
  readonly color: string

  @IsIn(PLAYER_SHAPES)
  readonly shape: PlayerShape

  @IsOptional()
  @IsString()
  readonly handle: string | null

  @IsBoolean()
  readonly isCurrentUser: boolean

  @IsDate()
  readonly createdAt: Date

  @IsDate()
  readonly updatedAt: Date

  @IsOptional()
  @IsDate()
  readonly deletedAt: Date | null

  constructor(
    params: Omit<PlayerWrite, 'handle' | 'deletedAt'> & {
      userId: string
      handle?: string | null
      deletedAt?: Date | null
    },
  ) {
    super()
    this.userId = params.userId
    this.id = params.id
    this.name = params.name
    this.color = params.color
    this.shape = params.shape
    this.handle = params.handle ?? null
    this.isCurrentUser = params.isCurrentUser
    this.createdAt = params.createdAt
    this.updatedAt = params.updatedAt
    this.deletedAt = params.deletedAt ?? null
  }
}
