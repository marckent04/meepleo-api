import { z } from 'zod'
import {
  SCORING_OUTCOMES,
  SCORING_ROW_INPUTS,
  SCORING_SIDES,
  type ScoringTemplate,
} from '@/shared/types'
import type { Prisma } from '../generated/prisma/client'
import { type LocalizedText, toLocalizedText } from './localized-text.mapper'

/**
 * Score sheet templates stored in Json columns. A game's template
 * (`games.scoring_template`) holds LocalizedText texts; a play's copy
 * (`plays.scoring`) holds the texts of the play language.
 */

const LocalizedTextSchema = z.record(z.string(), z.string())

function templateSchema<TText extends z.ZodType>(text: TText) {
  return z.object({
    sides: z.enum(SCORING_SIDES),
    outcome: z.enum(SCORING_OUTCOMES),
    rounds: z.object({ count: z.number().int().nullable() }).nullable(),
    targetScore: z.number().int().nullable(),
    rows: z.array(
      z.object({
        key: z.string(),
        label: text,
        hint: text.nullable(),
        input: z.enum(SCORING_ROW_INPUTS),
        pointsEach: z.number().int(),
        exclusive: z.boolean(),
      }),
    ),
    tieBreaker: text.nullable(),
  })
}

const StoredScoringTemplateSchema = templateSchema(LocalizedTextSchema)
const PlayScoringTemplateSchema = templateSchema(z.string())

/** Game template as stored: texts in every available language. */
export type StoredScoringTemplate = z.infer<typeof StoredScoringTemplateSchema>

/** Text in `language`, otherwise in any available language. */
function pick(text: LocalizedText, language: string): string | null {
  return text[language] ?? Object.values(text)[0] ?? null
}

/**
 * Game template in `language`, or null when the game has none or the stored
 * value is unreadable. A text missing in `language` falls back to another
 * language, a missing label to the row key.
 */
export function toScoringTemplate(
  value: Prisma.JsonValue | null,
  language: string,
): ScoringTemplate | null {
  const parsed = StoredScoringTemplateSchema.safeParse(value)
  if (!parsed.success) return null
  const template = parsed.data
  const text = (localizedText: LocalizedText | null) =>
    localizedText ? pick(toLocalizedText(localizedText), language) : null
  return {
    ...template,
    rows: template.rows.map((row) => ({
      ...row,
      label: text(row.label) ?? row.key,
      hint: text(row.hint),
    })),
    tieBreaker: text(template.tieBreaker),
  }
}

/** Throws when the stored copy is corrupted (written by the API only). */
export function toPlayScoringTemplate(
  value: Prisma.JsonValue,
): ScoringTemplate {
  return PlayScoringTemplateSchema.parse(value)
}

export function toScoringTemplateJson(
  template: ScoringTemplate | StoredScoringTemplate,
): Prisma.InputJsonValue {
  return template as Prisma.InputJsonValue
}

/** Game template to store, its texts written in `language`. */
export function toStoredScoringTemplate(
  template: ScoringTemplate,
  language: string,
): StoredScoringTemplate {
  const localizedText = (value: string | null) =>
    value === null ? null : { [language]: value }
  return {
    ...template,
    rows: template.rows.map((row) => ({
      ...row,
      label: { [language]: row.label },
      hint: localizedText(row.hint),
    })),
    tieBreaker: localizedText(template.tieBreaker),
  }
}
