import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * Date sent to the API: ISO 8601 in UTC only (trailing `Z`); an offset such as
 * `+02:00` is rejected with 400 VALIDATION_FAILED.
 */
export const DateTimeSchema = z.iso
  .datetime()
  .meta({ example: '2026-11-12T19:00:00.000Z' })

/** Query string of the `GET` list routes. */
export const UpdatedSinceQuerySchema = z.object({
  updatedSince: DateTimeSchema.optional().describe(
    'Only entities modified after this date (ISO 8601, UTC); tombstones (`deletedAt`) are included when present',
  ),
})

export class UpdatedSinceQueryDto extends createZodDto(
  UpdatedSinceQuerySchema,
) {}

/** Sync fields of a response. */
export const SyncResponseFields = {
  createdAt: z.iso
    .datetime()
    .describe('Creation date (ISO 8601, UTC), set by the client'),
  updatedAt: z.iso
    .datetime()
    .describe(
      'Last modification date (ISO 8601, UTC), set by the client; the most recent wins',
    ),
  revision: z
    .number()
    .int()
    .describe('Server-side change counter, cursor of `sync/pull`'),
  deletedAt: z.iso
    .datetime()
    .optional()
    .describe('Deletion date (tombstone), absent when the entity is alive'),
}

/** Sync fields accepted from a client on a write. */
export const SyncWriteFields = {
  createdAt: DateTimeSchema.optional().describe(
    'Creation date set by the client (ISO 8601, UTC); defaults to now',
  ),
  updatedAt: DateTimeSchema.optional().describe(
    'Last modification date set by the client (ISO 8601, UTC); defaults to now',
  ),
}

export function toSyncResponse(entity: {
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  revision: number
}) {
  return {
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
    revision: entity.revision,
    ...(entity.deletedAt && { deletedAt: entity.deletedAt.toISOString() }),
  }
}
