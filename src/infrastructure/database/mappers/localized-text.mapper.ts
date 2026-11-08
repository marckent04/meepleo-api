import type { Prisma } from '../generated/prisma/client'

/** `{ "fr": "...", "en": "..." }` stored in a Json column. */
export type LocalizedText = Record<string, string>

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Keeps only the string entries; anything else becomes `{}`. */
export function toLocalizedText(value: Prisma.JsonValue | null): LocalizedText {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  )
}

/** Text in `language`, or null when missing. */
export function localized(
  value: Prisma.JsonValue | null,
  language: string,
): string | null {
  return toLocalizedText(value)[language] ?? null
}

/** Copy of `value` with `text` set for `language`. */
export function withLanguage(
  value: Prisma.JsonValue | null,
  language: string,
  text: string,
): LocalizedText {
  return { ...toLocalizedText(value), [language]: text }
}
