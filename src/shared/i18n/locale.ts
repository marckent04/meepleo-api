export const SUPPORTED_LOCALES = ['fr', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'fr'

function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/**
 * Preferred supported language of an Accept-Language header: sorted by q-value,
 * region ignored (`en-GB` → `en`). `null` if none is supported.
 */
export function parseLocale(acceptLanguage?: string | string[]): Locale | null {
  const header = Array.isArray(acceptLanguage)
    ? acceptLanguage.join(',')
    : acceptLanguage
  if (!header) return null

  const candidates = header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';')
      const qParam = params.find((param) => param.trim().startsWith('q='))
      const quality = qParam ? Number(qParam.trim().slice(2)) : 1
      return {
        language: tag.trim().toLowerCase().split('-')[0],
        quality: Number.isFinite(quality) ? quality : 0,
        index,
      }
    })
    .filter((candidate) => candidate.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index)

  return (
    (candidates.find((candidate) => isSupportedLocale(candidate.language))
      ?.language as Locale | undefined) ?? null
  )
}

/** Like `parseLocale`, falling back to DEFAULT_LOCALE. */
export function resolveLocale(acceptLanguage?: string | string[]): Locale {
  return parseLocale(acceptLanguage) ?? DEFAULT_LOCALE
}
