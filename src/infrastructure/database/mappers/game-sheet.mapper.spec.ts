import dnupOutput from '@/infrastructure/adapters/anthropic/__fixtures__/dnup-sheet.output.json'
import type { GameSheetOutput } from '@/infrastructure/adapters/anthropic/game-sheet.schema'
import { toGameSheet } from '@/infrastructure/adapters/anthropic/game-sheet-generator'
import { GameSheetTranslation } from '@/shared/types'
import { GAME_ID, gameRecord } from '../__fixtures__/game-record.fixture'
import type { GameRule as GameRuleRecord } from '../generated/prisma/client'
import {
  type GameWithRulesRecord,
  isGameSheetAggregated,
  toGameSheetTranslationData,
  toGeneratedGameSheetData,
  toStoredGameSheet,
} from './game-sheet.mapper'

const generated = toGameSheet(
  GAME_ID,
  'fr',
  'claude-haiku-5-5',
  dnupOutput as GameSheetOutput,
)

/** Simule l'écriture en base d'une fiche générée. */
function storeGenerated(): GameWithRulesRecord {
  const current = gameRecord()
  const data = toGeneratedGameSheetData(generated, current)
  const rules = data.rules.map(
    (rule, i): GameRuleRecord => ({
      id: `0195d1a2-0000-7000-8000-${String(i).padStart(12, '0')}`,
      gameId: GAME_ID,
      type: rule.type,
      order: rule.order,
      position: rule.position ?? 0,
      playerCounts: rule.playerCounts as number[],
      optional: rule.optional ?? false,
      title: (rule.title as GameRuleRecord['title']) ?? null,
      text: rule.text as GameRuleRecord['text'],
      createdAt: current.createdAt,
      updatedAt: current.updatedAt,
    }),
  )
  // Ordre d'insertion inversé : la lecture doit retrier.
  return {
    ...current,
    ...data.game,
    rules: rules.reverse(),
    // Run de génération enregistré dans la même transaction.
    aggregationRuns: [
      { model: generated.generatedBy, createdAt: generated.generatedAt },
    ],
  } as GameWithRulesRecord
}

describe('game sheet mapper', () => {
  it('stores a generated sheet and reads it back', () => {
    const record = storeGenerated()

    expect(isGameSheetAggregated(record, 'fr')).toBe(true)
    expect(isGameSheetAggregated(record, 'en')).toBe(false)

    const sheet = toStoredGameSheet(record, 'fr')
    const withoutIds = <T extends { id: string }>(entries: T[]) =>
      entries.map(({ id: _, ...rest }) => rest)

    expect(withoutIds(sheet.setup)).toEqual(withoutIds(generated.setup))
    expect(withoutIds(sheet.turn.steps)).toEqual(
      withoutIds(generated.turn.steps),
    )
    expect(sheet.specialRules.map((r) => r.title)).toEqual(
      generated.specialRules.map((r) => r.title),
    )
    expect(withoutIds(sheet.endOfGame.winner)).toEqual(
      withoutIds(generated.endOfGame.winner),
    )
    expect(sheet).toMatchObject({
      gameId: GAME_ID,
      language: 'fr',
      description: generated.description,
      turn: { summary: generated.turn.summary },
      endOfGame: { timing: generated.endOfGame.timing },
      confidence: generated.confidence,
      sources: generated.sources,
      warnings: generated.warnings,
      generatedBy: 'claude-haiku-5-5',
      generatedAt: generated.generatedAt,
    })
  })

  it('keeps BGG columns and fills only the empty ones', () => {
    const data = toGeneratedGameSheetData(generated, gameRecord())

    expect(data.game).toMatchObject({
      publisher: 'Gigamic',
      minPlayers: 2,
      maxPlayers: generated.players.max,
      minAge: generated.minAge,
      ruleBookUrl: generated.game.ruleBookUrl,
      supportedLanguages: ['fr'],
      sheetConfidence: 'HIGH',
    })
  })

  it('maps "every player count" to an empty array and back to null', () => {
    const data = toGeneratedGameSheetData(generated, gameRecord())
    const allPlayers = generated.setup.find((e) => e.playerCounts === null)
    expect(allPlayers).toBeDefined()
    expect(
      data.rules.find(
        (r) => (r.text as Record<string, string>).fr === allPlayers?.text,
      )?.playerCounts,
    ).toEqual([])

    const stored = toStoredGameSheet(storeGenerated(), 'fr')
    expect(
      stored.setup.find((e) => e.text === allPlayers?.text)?.playerCounts,
    ).toBeNull()
  })

  it('merges a translation into the existing rules', () => {
    const record = storeGenerated()
    const source = toStoredGameSheet(record, 'fr')
    const ruleIds = record.rules.map((r) => r.id)
    const translation = new GameSheetTranslation(
      GAME_ID,
      'fr',
      'en',
      'Dnup',
      'English description',
      'English summary',
      'English timing',
      source.warnings.map((w) => `EN ${w}`),
      record.rules.map((r) => ({
        id: r.id,
        title: r.title === null ? null : `EN title ${r.id}`,
        text: `EN text ${r.id}`,
      })),
    )

    const data = toGameSheetTranslationData(translation, record)

    expect(data.rules.map((r) => r.id)).toEqual(ruleIds)
    expect(data.game.supportedLanguages).toEqual(['fr', 'en'])
    const updated = {
      ...record,
      ...data.game,
      rules: record.rules.map((rule) => ({
        ...rule,
        ...data.rules.find((r) => r.id === rule.id)?.data,
      })),
    } as GameWithRulesRecord

    expect(isGameSheetAggregated(updated, 'en')).toBe(true)
    const en = toStoredGameSheet(updated, 'en')
    expect(en.description).toBe('English description')
    expect(en.setup[0].text).toBe(`EN text ${en.setup[0].id}`)
    expect(en.turn.steps[0].title).toBe(`EN title ${en.turn.steps[0].id}`)
    expect(en.warnings).toEqual(source.warnings.map((w) => `EN ${w}`))
    // La langue source est conservée.
    expect(toStoredGameSheet(updated, 'fr')).toEqual(source)
  })

  it('rejects a translated rule that does not belong to the game', () => {
    const translation = new GameSheetTranslation(
      GAME_ID,
      'fr',
      'en',
      'Dnup',
      '',
      '',
      '',
      [],
      [{ id: 'unknown', title: null, text: 'x' }],
    )
    expect(() =>
      toGameSheetTranslationData(translation, storeGenerated()),
    ).toThrow('does not belong')
  })

  it('refuses to read a sheet that was never generated', () => {
    expect(() => toStoredGameSheet(gameRecord(), 'fr')).toThrow()
  })

  it('does not consider a sheet aggregated without a successful generation run', () => {
    const record = { ...storeGenerated(), aggregationRuns: [] }
    expect(isGameSheetAggregated(record, 'fr')).toBe(false)
  })

  it('no longer stores the generation date and model on the game', () => {
    const data = toGeneratedGameSheetData(generated, gameRecord())
    expect(data.game).not.toHaveProperty('sheetGeneratedAt')
    expect(data.game).not.toHaveProperty('sheetGeneratedBy')
  })
})
