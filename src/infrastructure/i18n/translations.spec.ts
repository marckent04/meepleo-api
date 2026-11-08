import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { ERROR_CODES } from '@/shared/errors'
import { SUPPORTED_LOCALES } from '@/shared/i18n/locale'
import { I18N_PATH } from './i18n.module'

/** Zod 4 issue codes: each must be translated in validation.zod. */
const ZOD_ISSUE_CODES = [
  'invalid_type',
  'too_small',
  'too_big',
  'invalid_format',
  'invalid_value',
  'not_multiple_of',
  'unrecognized_keys',
  'invalid_union',
  'invalid_key',
  'invalid_element',
  'custom',
]

type Translations = Record<string, unknown>

function load(locale: string, file: string): Translations {
  return JSON.parse(
    readFileSync(path.join(I18N_PATH, locale, `${file}.json`), 'utf8'),
  ) as Translations
}

function sortedKeys(value: unknown, prefix = ''): string[] {
  return Object.entries(value as Translations)
    .flatMap(([key, entry]) =>
      typeof entry === 'object' && entry !== null
        ? sortedKeys(entry, `${prefix}${key}.`)
        : [`${prefix}${key}`],
    )
    .sort()
}

describe('translations', () => {
  it('provides a folder for every supported locale and nothing else', () => {
    expect(readdirSync(I18N_PATH).sort()).toEqual([...SUPPORTED_LOCALES].sort())
  })

  describe.each(SUPPORTED_LOCALES)('%s', (locale) => {
    it('translates exactly the catalogued error codes', () => {
      expect(Object.keys(load(locale, 'errors')).sort()).toEqual(
        Object.keys(ERROR_CODES).sort(),
      )
    })

    it('translates every Zod issue code and has a default message', () => {
      const validation = load(locale, 'validation')
      expect(validation.default).toEqual(expect.any(String))
      expect(Object.keys(validation.zod as Translations).sort()).toEqual(
        [...ZOD_ISSUE_CODES].sort(),
      )
    })

    it('has no empty message', () => {
      for (const file of ['errors', 'validation']) {
        const translations = load(locale, file)
        for (const key of sortedKeys(translations)) {
          const message = key
            .split('.')
            .reduce<unknown>(
              (node, part) => (node as Translations)[part],
              translations,
            )
          expect(message, `${locale}/${file}:${key}`).toMatch(/\S/)
        }
      }
    })
  })

  it('has the same validation keys in every locale', () => {
    const [reference, ...others] = SUPPORTED_LOCALES.map((locale) =>
      sortedKeys(load(locale, 'validation')),
    )
    for (const keys of others) expect(keys).toEqual(reference)
  })
})
