import { DEFAULT_SCORING_TEMPLATE } from '@/shared/types'
import {
  toPlayScoringTemplate,
  toScoringTemplate,
  toStoredScoringTemplate,
} from './scoring-template.mapper'

const stored = {
  sides: 'individual',
  outcome: 'highest',
  rounds: null,
  targetScore: 10,
  rows: [
    {
      key: 'longestRoad',
      label: { fr: 'Route la plus longue', en: 'Longest road' },
      hint: { fr: '5 routes minimum' },
      input: 'toggle',
      pointsEach: 2,
      exclusive: true,
    },
    {
      key: 'cities',
      label: {},
      hint: null,
      input: 'count',
      pointsEach: 2,
      exclusive: false,
    },
  ],
  tieBreaker: { en: 'Most cities wins' },
}

describe('scoring template mapper', () => {
  it('reads a game template in the requested language', () => {
    expect(toScoringTemplate(stored, 'en')).toEqual({
      sides: 'individual',
      outcome: 'highest',
      rounds: null,
      targetScore: 10,
      rows: [
        {
          key: 'longestRoad',
          label: 'Longest road',
          hint: '5 routes minimum',
          input: 'toggle',
          pointsEach: 2,
          exclusive: true,
        },
        {
          key: 'cities',
          label: 'cities',
          hint: null,
          input: 'count',
          pointsEach: 2,
          exclusive: false,
        },
      ],
      tieBreaker: 'Most cities wins',
    })
  })

  it.each([
    ['no template', null],
    ['an unreadable value', { sides: 'everyone' }],
  ])('returns null for %s', (_, value) => {
    expect(toScoringTemplate(value, 'fr')).toBeNull()
  })

  it('reads the copy stored in a play', () => {
    expect(toPlayScoringTemplate({ ...DEFAULT_SCORING_TEMPLATE })).toEqual(
      DEFAULT_SCORING_TEMPLATE,
    )
  })

  it('throws on a corrupted play copy', () => {
    expect(() => toPlayScoringTemplate({ outcome: 'highest' })).toThrow()
  })

  it('stores a template with its texts in the generation language', () => {
    const template = toScoringTemplate(stored, 'fr')
    if (!template) throw new Error('Expected a template')

    const result = toStoredScoringTemplate(template, 'fr')

    expect(result.rows[0]).toMatchObject({
      label: { fr: 'Route la plus longue' },
      hint: { fr: '5 routes minimum' },
    })
    expect(result.rows[1].hint).toBeNull()
    expect(toScoringTemplate(result, 'en')).toEqual(template)
  })
})
