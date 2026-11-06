import { GameSheet } from '@/shared/types'
import {
  GameIdParamSchema,
  GameResponseDto,
  GameResponseSchema,
  GameSearchResponseSchema,
  SearchGamesQuerySchema,
} from './game.dto'

const id = (n: number) =>
  `0195d1a2-0000-7000-8000-${String(n).padStart(12, '0')}`

const sheet = new GameSheet(
  id(0),
  'fr',
  {
    localizedName: 'Dnup',
    edition: null,
    publisher: 'Gigamic',
    ruleBookUrl: null,
  },
  { min: 2, max: 5, recommended: [3] },
  8,
  { min: 20, max: 20 },
  'Description',
  [{ id: id(1), order: 1, playerCounts: [2, 3], text: 'Retirez des cartes.' }],
  {
    summary: 'Résumé',
    steps: [
      {
        id: id(2),
        order: 1,
        playerCounts: null,
        optional: true,
        title: 'Jouer',
        text: 'Posez une carte.',
      },
    ],
  },
  [{ id: id(3), playerCounts: null, title: 'Le doup', text: 'Doup !' }],
  [{ id: id(7), playerCounts: null, title: 'Mode solo', text: 'Jouez seul.' }],
  {
    triggers: [{ id: id(4), playerCounts: null, text: 'Main vide.' }],
    timing: 'Immédiatement',
    scoring: [
      {
        id: id(5),
        order: 1,
        playerCounts: null,
        title: 'Points',
        text: '1 point.',
      },
    ],
    winner: [{ id: id(6), playerCounts: null, text: 'Le plus de points.' }],
  },
  'high',
  [{ title: 'Règle', url: 'https://example.com' }],
  ['Avertissement'],
  'claude-haiku-5-5',
  new Date('2026-01-01T12:00:00.000Z'),
)

describe('GameResponseDto', () => {
  it('maps the domain model to a valid response', () => {
    const response = GameResponseDto.fromDomain(sheet)

    expect(response).toMatchObject({
      gameId: id(0),
      language: 'fr',
      game: { localizedName: 'Dnup', publisher: 'Gigamic' },
      generatedAt: '2026-01-01T12:00:00.000Z',
    })
    expect(GameResponseSchema.safeParse(response).success).toBe(true)
  })

  it('rejects an unknown confidence', () => {
    expect(
      GameResponseSchema.safeParse({
        ...GameResponseDto.fromDomain(sheet),
        confidence: 'certain',
      }).success,
    ).toBe(false)
  })
})

describe('GameIdParamSchema', () => {
  it('accepts a UUID and rejects anything else', () => {
    expect(GameIdParamSchema.safeParse({ id: id(0) }).success).toBe(true)
    expect(GameIdParamSchema.safeParse({ id: '42' }).success).toBe(false)
  })
})

describe('SearchGamesQuerySchema', () => {
  it('trims the search and defaults the limit', () => {
    expect(SearchGamesQuerySchema.parse({ search: '  cat ' })).toEqual({
      search: 'cat',
      limit: 10,
    })
  })

  it('coerces the limit from the query string', () => {
    expect(
      SearchGamesQuerySchema.parse({ search: 'cat', limit: '5' }).limit,
    ).toBe(5)
  })

  it.each([
    [{}],
    [{ search: ' c ' }],
    [{ search: 'x'.repeat(101) }],
    [{ search: 'cat', limit: '0' }],
    [{ search: 'cat', limit: '21' }],
    [{ search: 'cat', limit: 'abc' }],
  ])('rejects %j', (query) => {
    expect(SearchGamesQuerySchema.safeParse(query).success).toBe(false)
  })
})

describe('GameSearchResponseSchema', () => {
  it('accepts search results', () => {
    expect(
      GameSearchResponseSchema.safeParse([
        { id: id(0), name: 'Catane', year: 1995, categories: ['strategy'] },
        { id: id(1), name: 'Dnup', year: null, categories: [] },
      ]).success,
    ).toBe(true)
  })
})
