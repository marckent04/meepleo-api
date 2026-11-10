import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { type FavoriteEntry, GAME_CATEGORIES } from '@/shared/types'

export const FavoriteEntrySchema = z.object({
  id: z.uuid().describe('Game identifier'),
  name: z
    .string()
    .describe(
      'Name in the Accept-Language language if the sheet was generated in it, otherwise the canonical name',
    )
    .meta({ example: 'Catan' }),
  year: z.number().int().nullable().describe('Publication year'),
  categories: z.array(z.enum(GAME_CATEGORIES)).describe('Game categories'),
  imageUrl: z.string().nullable().describe('URL of the box cover image'),
  addedAt: z.iso
    .datetime()
    .describe('Date added to favorites (ISO 8601, UTC)')
    .meta({ example: '2026-01-01T12:00:00.000Z' }),
})

export const FavoritesResponseSchema = z
  .array(FavoriteEntrySchema)
  .describe("User's favorite games, most recently added first")

export class FavoritesResponseDto extends createZodDto(
  FavoritesResponseSchema,
  {
    codec: true,
  },
) {
  static fromDomain(entries: FavoriteEntry[]): FavoritesResponseDto {
    return entries.map((entry) => ({
      ...entry,
      categories: [...entry.categories],
      addedAt: entry.addedAt.toISOString(),
    }))
  }
}

export const FavoriteGameIdParamSchema = z.object({
  gameId: z
    .uuid()
    .describe('Game identifier')
    .meta({ example: '0195d1a2-0000-7000-8000-000000000001' }),
})

export class FavoriteGameIdParamDto extends createZodDto(
  FavoriteGameIdParamSchema,
) {}
