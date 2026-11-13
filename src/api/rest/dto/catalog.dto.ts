import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { type CatalogEntry, GAME_CATEGORIES } from '@/shared/types'
import { SyncResponseFields, toSyncResponse } from './sync-fields.dto'

export const CatalogEntrySchema = z.object({
  id: z.uuid().describe('Game identifier'),
  name: z
    .string()
    .describe(
      'Name in the Accept-Language language if the sheet was generated in it, otherwise canonical name',
    )
    .meta({ example: 'Catan' }),
  year: z.number().int().nullable().describe('Publication year'),
  categories: z.array(z.enum(GAME_CATEGORIES)).describe('Game categories'),
  imageUrl: z.string().nullable().describe('URL of the box cover image'),
  addedAt: z.iso
    .datetime()
    .describe('Date added to the catalog (ISO 8601, UTC)')
    .meta({ example: '2026-01-01T12:00:00.000Z' }),
  updatedAt: SyncResponseFields.updatedAt,
  revision: SyncResponseFields.revision,
  deletedAt: SyncResponseFields.deletedAt,
})

export const CatalogResponseSchema = z
  .array(CatalogEntrySchema)
  .describe("Games in the user's catalog, most recently added first")

export class CatalogResponseDto extends createZodDto(CatalogResponseSchema, {
  codec: true,
}) {
  static fromDomain(entries: CatalogEntry[]): CatalogResponseDto {
    return entries.map(
      ({ addedAt, updatedAt, deletedAt, revision, ...entry }) => ({
        ...entry,
        categories: [...entry.categories],
        addedAt: addedAt.toISOString(),
        ...toSyncResponse({
          createdAt: addedAt,
          updatedAt,
          deletedAt,
          revision,
        }),
      }),
    )
  }
}

export const CatalogGameIdParamSchema = z.object({
  gameId: z
    .uuid()
    .describe('Game identifier')
    .meta({ example: '0195d1a2-0000-7000-8000-000000000001' }),
})

export class CatalogGameIdParamDto extends createZodDto(
  CatalogGameIdParamSchema,
) {}
