import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import type { CatalogEntry } from '@/shared/types'
import { CatalogEntrySchema } from './catalog.dto'

export const WishlistResponseSchema = z
  .array(CatalogEntrySchema)
  .describe(
    "Jeux de la liste de souhaits de l'utilisateur, derniers ajouts d'abord",
  )

export class WishlistResponseDto extends createZodDto(WishlistResponseSchema, {
  codec: true,
}) {
  static fromDomain(entries: CatalogEntry[]): WishlistResponseDto {
    return entries.map((entry) => ({
      ...entry,
      categories: [...entry.categories],
      addedAt: entry.addedAt.toISOString(),
    }))
  }
}

export const WishlistGameIdParamSchema = z.object({
  gameId: z
    .uuid()
    .describe('Identifiant du jeu')
    .meta({ example: '0195d1a2-0000-7000-8000-000000000001' }),
})

export class WishlistGameIdParamDto extends createZodDto(
  WishlistGameIdParamSchema,
) {}
