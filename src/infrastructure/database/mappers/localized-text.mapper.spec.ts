import {
  localized,
  toLocalizedText,
  withLanguage,
} from './localized-text.mapper'

describe('localized text mapper', () => {
  it('keeps only the string entries', () => {
    expect(toLocalizedText({ fr: 'Catane', en: 1 })).toEqual({ fr: 'Catane' })
    expect(toLocalizedText(null)).toEqual({})
    expect(toLocalizedText(['fr'])).toEqual({})
  })

  it('reads the text of a language', () => {
    expect(localized({ fr: 'Catane' }, 'fr')).toBe('Catane')
    expect(localized({ fr: 'Catane' }, 'en')).toBeNull()
  })

  it('sets the text of a language, keeping the others', () => {
    expect(withLanguage({ fr: 'Catane' }, 'en', 'Catan')).toEqual({
      fr: 'Catane',
      en: 'Catan',
    })
  })
})
