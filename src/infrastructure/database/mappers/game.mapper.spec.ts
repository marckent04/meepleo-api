import { gameRecord } from '../__fixtures__/game-record.fixture'
import {
  toGame,
  toGameSearchResult,
  toGameSearchResultFromRecord,
  toIdentifiedGameCreateData,
} from './game.mapper'

const id = '0195d1a2-0000-7000-8000-000000000001'

describe('game mapper', () => {
  it('maps a record to a game with its known catalog data', () => {
    const game = toGame(
      gameRecord({
        minPlayers: 2,
        maxPlayers: 4,
        minAge: null,
        minDuration: 30,
        maxDuration: 60,
        imageUrl: 'https://example.com/dnup.jpg',
      }),
    )

    expect(game.known).toEqual({
      minPlayers: 2,
      maxPlayers: 4,
      minAge: null,
      minDuration: 30,
      maxDuration: 60,
      hasImage: true,
    })
  })

  it('maps a record without catalog data to empty known data', () => {
    expect(toGame(gameRecord()).known.hasImage).toBe(false)
  })

  it('maps a search row, preferring the localized name', () => {
    expect(
      toGameSearchResult({
        id,
        name: 'CATAN',
        localized_name: 'Catane',
        year: 1995,
        categories: ['STRATEGY'],
        image_url: 'https://example.com/catan.jpg',
      }),
    ).toEqual({
      id,
      name: 'Catane',
      year: 1995,
      categories: ['strategy'],
      imageUrl: 'https://example.com/catan.jpg',
    })
  })

  it.each([
    ['fr', 'Catane'],
    ['en', 'CATAN'],
  ])(
    'maps a record in %s, falling back to the canonical name',
    (language, name) => {
      expect(
        toGameSearchResultFromRecord(
          {
            id,
            name: 'CATAN',
            localizedNames: { fr: 'Catane' },
            year: 1995,
            categories: ['STRATEGY', 'FAMILY'],
            imageUrl: null,
          },
          language,
        ),
      ).toEqual({
        id,
        name,
        year: 1995,
        categories: ['strategy', 'family'],
        imageUrl: null,
      })
    },
  )

  it('maps an identified game to the creation data', () => {
    expect(
      toIdentifiedGameCreateData({
        bggId: 13,
        name: 'CATAN',
        localizedName: 'Catane',
        year: 1995,
        categories: ['strategy'],
      }),
    ).toEqual({
      bggId: 13,
      name: 'CATAN',
      year: 1995,
      categories: ['STRATEGY'],
    })
  })
})
