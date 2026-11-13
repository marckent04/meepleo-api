import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import type { CatalogEntry } from '@/shared/types'
import { CatalogEntrySchema, CatalogResponseDto } from './catalog.dto'

export const WishlistResponseSchema = z
  .array(CatalogEntrySchema)
  .describe("Games in the user's wishlist, most recently added first")

export class WishlistResponseDto extends createZodDto(WishlistResponseSchema, {
  codec: true,
}) {
  static fromDomain(entries: CatalogEntry[]): WishlistResponseDto {
    return CatalogResponseDto.fromDomain(entries)
  }
}

export const WishlistGameIdParamSchema = z.object({
  gameId: z
    .uuid()
    .describe('Game identifier')
    .meta({ example: '0195d1a2-0000-7000-8000-000000000001' }),
})

export class WishlistGameIdParamDto extends createZodDto(
  WishlistGameIdParamSchema,
) {}
