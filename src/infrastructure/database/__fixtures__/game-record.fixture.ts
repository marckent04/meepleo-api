import type { GameWithRulesRecord } from '../mappers'

export const GAME_ID = '0195d1a2-0000-7000-8000-000000000001'

/** Game from the BGG seed, without a sheet. */
export function gameRecord(
  overrides: Partial<GameWithRulesRecord> = {},
): GameWithRulesRecord {
  return {
    id: GAME_ID,
    bggId: 123,
    name: 'Dnup',
    localizedNames: null,
    description: null,
    year: 2021,
    designers: [],
    publisher: 'Gigamic',
    edition: null,
    imageUrl: null,
    ruleBookUrl: null,
    categories: [],
    minPlayers: 2,
    maxPlayers: null,
    minAge: null,
    minDuration: null,
    maxDuration: null,
    supportedLanguages: [],
    turnSummary: null,
    endTiming: null,
    sheetConfidence: null,
    sheetSources: null,
    sheetWarnings: null,
    scoringTemplate: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    rules: [],
    aggregationRuns: [],
    ...overrides,
  }
}
