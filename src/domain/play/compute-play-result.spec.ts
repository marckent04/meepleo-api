import { BusinessRuleError, ErrorCode } from '@/shared/errors'
import {
  DEFAULT_SCORING_TEMPLATE,
  type PlayScore,
  ROUND_SCORE_KEY,
  type ScoringRow,
  type ScoringTemplate,
  TOTAL_SCORE_KEY,
} from '@/shared/types'
import {
  assertValidPlayerSides,
  assertValidScores,
  assertValidScoringTemplate,
  assertValidWinnerSides,
  computeSideResults,
  computeWinnerSides,
} from './compute-play-result'

function row(
  key: string,
  input: ScoringRow['input'],
  pointsEach = 1,
  exclusive = false,
): ScoringRow {
  return { key, label: key, hint: null, input, pointsEach, exclusive }
}

function template(overrides: Partial<ScoringTemplate>): ScoringTemplate {
  return { ...DEFAULT_SCORING_TEMPLATE, ...overrides }
}

const catan = template({
  targetScore: 10,
  rows: [
    row('settlements', 'count'),
    row('cities', 'count', 2),
    row('longestRoad', 'toggle', 2, true),
    row('largestArmy', 'toggle', 2, true),
    row('vpCards', 'count'),
  ],
})

/** 6 nimmt! / Skyjo / Dekal: free rounds, lowest wins. */
const lowestRounds = template({
  outcome: 'lowest',
  rounds: { count: null },
  targetScore: 66,
})

const azul = template({
  rounds: { count: null },
  rows: [
    row('lines', 'count', 2),
    row('columns', 'count', 7),
    row('colors', 'count', 10),
  ],
})

const manual = template({ outcome: 'manual' })

function cell(side: number, rowKey: string, value: number, round = 0) {
  return { side, rowKey, round, value } satisfies PlayScore
}

function rounds(values: number[][]): PlayScore[] {
  return values.flatMap((perSide, index) =>
    perSide.map((value, side) => cell(side, ROUND_SCORE_KEY, value, index + 1)),
  )
}

function codeOf(run: () => void): ErrorCode | undefined {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(BusinessRuleError)
    return (error as BusinessRuleError).code
  }
  return undefined
}

describe('computeSideResults', () => {
  it('multiplies counts and toggles by their points (Catan)', () => {
    const scores = [
      cell(0, 'settlements', 2),
      cell(0, 'cities', 3),
      cell(0, 'longestRoad', 1),
      cell(1, 'settlements', 4),
      cell(1, 'cities', 1),
      cell(1, 'largestArmy', 1),
      cell(1, 'vpCards', 1),
    ]

    expect(computeSideResults(catan, 2, scores)).toEqual([
      { side: 0, total: 10, rank: 1 },
      { side: 1, total: 9, rank: 2 },
    ])
  })

  it('sums the rounds and ranks the lowest first (6 nimmt!)', () => {
    const scores = rounds([
      [12, 7, 23],
      [5, 31, 9],
    ])

    expect(computeSideResults(lowestRounds, 3, scores)).toEqual([
      { side: 0, total: 17, rank: 1 },
      { side: 1, total: 38, rank: 3 },
      { side: 2, total: 32, rank: 2 },
    ])
  })

  it('adds end-of-game rows to the rounds (Azul)', () => {
    const scores = [
      ...rounds([
        [10, 8],
        [15, 20],
      ]),
      cell(0, 'lines', 2),
      cell(0, 'colors', 1),
      cell(1, 'columns', 1),
    ]

    expect(computeSideResults(azul, 2, scores)).toEqual([
      { side: 0, total: 39, rank: 1 },
      { side: 1, total: 35, rank: 2 },
    ])
  })

  it('scores a single total per side without rows nor rounds', () => {
    const scores = [cell(0, TOTAL_SCORE_KEY, 87), cell(1, TOTAL_SCORE_KEY, 92)]

    expect(computeSideResults(DEFAULT_SCORING_TEMPLATE, 2, scores)).toEqual([
      { side: 0, total: 87, rank: 2 },
      { side: 1, total: 92, rank: 1 },
    ])
  })

  it('shares a rank on a tie and skips the next one', () => {
    const scores = [
      cell(0, TOTAL_SCORE_KEY, 10),
      cell(1, TOTAL_SCORE_KEY, 10),
      cell(2, TOTAL_SCORE_KEY, 4),
    ]

    const results = computeSideResults(DEFAULT_SCORING_TEMPLATE, 3, scores)

    expect(results.map(({ rank }) => rank)).toEqual([1, 1, 3])
    expect(computeWinnerSides(results)).toEqual([0, 1])
  })

  it('gives a side without any score a total of 0', () => {
    expect(computeSideResults(DEFAULT_SCORING_TEMPLATE, 2, [])).toEqual([
      { side: 0, total: 0, rank: 1 },
      { side: 1, total: 0, rank: 1 },
    ])
  })

  it('has neither totals nor winners for a manual outcome (Monopoly Deal)', () => {
    const results = computeSideResults(manual, 3, [])

    expect(results.every(({ total, rank }) => !total && !rank)).toBe(true)
    expect(computeWinnerSides(results)).toEqual([])
  })
})

describe('assertValidScoringTemplate', () => {
  it('accepts the reference templates', () => {
    for (const valid of [catan, lowestRounds, azul, manual]) {
      expect(codeOf(() => assertValidScoringTemplate(valid))).toBeUndefined()
    }
  })

  it.each([
    [
      'a manual outcome with rows',
      template({ ...manual, rows: [row('a', 'points')] }),
    ],
    [
      'a manual outcome with rounds',
      template({ ...manual, rounds: { count: 3 } }),
    ],
    [
      'a duplicate key',
      template({ rows: [row('a', 'points'), row('a', 'count')] }),
    ],
    ['a reserved key', template({ rows: [row(TOTAL_SCORE_KEY, 'points')] })],
    ['a points row worth 2', template({ rows: [row('a', 'points', 2)] })],
    ['a row worth 0', template({ rows: [row('a', 'count', 0)] })],
    ['an exclusive count', template({ rows: [row('a', 'count', 1, true)] })],
    ['0 rounds', template({ rounds: { count: 0 } })],
  ])('rejects %s', (_, invalid) => {
    expect(codeOf(() => assertValidScoringTemplate(invalid))).toBe(
      ErrorCode.INVALID_SCORING_TEMPLATE,
    )
  })
})

describe('assertValidPlayerSides', () => {
  it.each([
    ['individual', [0, 1, 2]],
    ['individual', [0]],
    ['teams', [0, 1, 0, 1]],
    ['cooperative', [0, 0, 0]],
  ] as const)('accepts %s sides %j', (sides, playerSides) => {
    expect(
      codeOf(() => assertValidPlayerSides(sides, [...playerSides])),
    ).toBeUndefined()
  })

  it.each([
    ['individual', []],
    ['individual', [0, 0]],
    ['individual', [0, 2]],
    ['teams', [0, 0]],
    ['teams', [0, 2, 0, 2]],
    ['cooperative', [0, 1]],
  ] as const)('rejects %s sides %j', (sides, playerSides) => {
    expect(codeOf(() => assertValidPlayerSides(sides, [...playerSides]))).toBe(
      ErrorCode.INVALID_PLAY_PLAYERS,
    )
  })
})

describe('assertValidScores', () => {
  it('accepts a complete grid', () => {
    const scores = [cell(0, 'cities', 2), cell(1, 'longestRoad', 1)]
    expect(codeOf(() => assertValidScores(catan, 2, scores))).toBeUndefined()
  })

  it.each([
    ['an unknown side', catan, [cell(2, 'cities', 1)]],
    ['an unknown row', catan, [cell(0, 'roads', 1)]],
    ['a round without rounds', catan, [cell(0, ROUND_SCORE_KEY, 1, 1)]],
    ['a round 0', lowestRounds, [cell(0, ROUND_SCORE_KEY, 1, 0)]],
    [
      'a round beyond the count',
      template({ rounds: { count: 2 } }),
      [cell(0, ROUND_SCORE_KEY, 1, 3)],
    ],
    ['a total beside rows', catan, [cell(0, TOTAL_SCORE_KEY, 1)]],
    ['a negative count', catan, [cell(0, 'cities', -1)]],
    ['a toggle at 2', catan, [cell(0, 'longestRoad', 2)]],
    [
      'an exclusive toggle checked twice',
      catan,
      [cell(0, 'longestRoad', 1), cell(1, 'longestRoad', 1)],
    ],
    [
      'the same cell twice',
      catan,
      [cell(0, 'cities', 1), cell(0, 'cities', 2)],
    ],
    [
      'a value out of bounds',
      DEFAULT_SCORING_TEMPLATE,
      [cell(0, TOTAL_SCORE_KEY, 1e6)],
    ],
    ['a score in a manual play', manual, [cell(0, TOTAL_SCORE_KEY, 1)]],
  ])('rejects %s', (_, sheet, scores) => {
    expect(codeOf(() => assertValidScores(sheet, 2, scores))).toBe(
      ErrorCode.INVALID_PLAY_SCORES,
    )
  })

  it('accepts negative points', () => {
    const scores = [cell(0, TOTAL_SCORE_KEY, -5)]
    expect(
      codeOf(() => assertValidScores(DEFAULT_SCORING_TEMPLATE, 1, scores)),
    ).toBeUndefined()
  })
})

describe('assertValidWinnerSides', () => {
  it('accepts no winner (cooperative defeat) and existing sides', () => {
    expect(codeOf(() => assertValidWinnerSides(1, []))).toBeUndefined()
    expect(codeOf(() => assertValidWinnerSides(3, [0, 2]))).toBeUndefined()
  })

  it.each([[[3]], [[-1]], [[1, 1]]])('rejects %j', (winners) => {
    expect(codeOf(() => assertValidWinnerSides(3, winners))).toBe(
      ErrorCode.INVALID_PLAY_WINNERS,
    )
  })
})
