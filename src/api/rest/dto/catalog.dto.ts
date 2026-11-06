import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { type CatalogEntry, GAME_CATEGORIES } from '@/shared/types'

export const CatalogEntrySchema = z.object({
  id: z.uuid().describe('Identifiant du jeu'),
  name: z
    .string()
    .describe(
      "Nom dans la langue d'Accept-Language si la fiche y a été générée, sinon nom canonique",
    )
    .meta({ example: 'Catan' }),
  year: z.number().int().nullable().describe('Année de publication'),
  categories: z.array(z.enum(GAME_CATEGORIES)).describe('Catégories du jeu'),
  addedAt: z.iso
    .datetime()
    .describe("Date d'ajout au catalogue (ISO 8601, UTC)")
    .meta({ example: '2026-01-01T12:00:00.000Z' }),
})

export const CatalogResponseSchema = z
  .array(CatalogEntrySchema)
  .describe("Jeux du catalogue de l'utilisateur, derniers ajouts d'abord")

export class CatalogResponseDto extends createZodDto(CatalogResponseSchema, {
  codec: true,
}) {
  static fromDomain(entries: CatalogEntry[]): CatalogResponseDto {
    return entries.map((entry) => ({
      ...entry,
      categories: [...entry.categories],
      addedAt: entry.addedAt.toISOString(),
    }))
  }
}

export const CatalogGameIdParamSchema = z.object({
  gameId: z
    .uuid()
    .describe('Identifiant du jeu')
    .meta({ example: '0195d1a2-0000-7000-8000-000000000001' }),
})

export class CatalogGameIdParamDto extends createZodDto(
  CatalogGameIdParamSchema,
) {}
