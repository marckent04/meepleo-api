import { DEFAULT_LOCALE, resolveLocale } from './locale'

describe('resolveLocale', () => {
  it.each([
    [undefined, DEFAULT_LOCALE],
    ['', DEFAULT_LOCALE],
    ['en', 'en'],
    ['en-GB', 'en'],
    ['de-DE, en;q=0.8, fr;q=0.9', 'fr'],
    ['fr;q=0.1, en;q=0.9', 'en'],
    ['de, es', DEFAULT_LOCALE],
    ['en;q=0', DEFAULT_LOCALE],
    [['en-US', 'fr'], 'en'],
  ])('resolves %j to %s', (header, expected) => {
    expect(resolveLocale(header)).toBe(expected)
  })
})
