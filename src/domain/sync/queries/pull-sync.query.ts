import { Query } from '@nestjs/cqrs'
import {
  IsInt,
  IsISO6391,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator'
import type { SyncPullResult } from '@/shared/types'

export const SYNC_PULL_DEFAULT_LIMIT = 100
export const SYNC_PULL_MAX_LIMIT = 500

/**
 * Changes of the user (tombstones included) since an opaque cursor, oldest
 * first; without cursor, the whole state.
 */
export class PullSyncQuery extends Query<SyncPullResult> {
  @IsUUID()
  readonly userId: string

  @IsISO6391()
  readonly language: string

  @IsOptional()
  @IsString()
  readonly cursor: string | null

  /** Maximum number of entities (all types together). */
  @IsInt()
  @Min(1)
  @Max(SYNC_PULL_MAX_LIMIT)
  readonly limit: number

  constructor({
    userId,
    language,
    cursor,
    limit,
  }: {
    userId: string
    language: string
    cursor?: string | null
    limit?: number
  }) {
    super()
    this.userId = userId
    this.language = language
    this.cursor = cursor ?? null
    this.limit = limit ?? SYNC_PULL_DEFAULT_LIMIT
  }
}
