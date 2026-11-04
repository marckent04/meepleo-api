export const SUPPORTED_LOCALES = ['fr', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'fr'

function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/**
 * Résout la langue depuis un en-tête Accept-Language : tri par q-value,
 * région ignorée (`en-GB` → `en`), repli sur DEFAULT_LOCALE.
 */
export function resolveLocale(acceptLanguage?: string | string[]): Locale {
  const header = Array.isArray(acceptLanguage)
    ? acceptLanguage.join(',')
    : acceptLanguage
  if (!header) return DEFAULT_LOCALE

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
      ?.language as Locale | undefined) ?? DEFAULT_LOCALE
  )
}
