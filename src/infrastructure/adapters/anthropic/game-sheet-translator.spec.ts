import Anthropic from '@anthropic-ai/sdk'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import type { LoggerService } from '@/infrastructure/logger/logger.service'
import type { AnthropicConfig } from '@/shared/config'
import { ErrorCode, InternalError } from '@/shared/errors'
import { GameSheet, GameSheetTranslation } from '@/shared/types'
import { GAME_SHEET_TRANSLATION_SYSTEM_PROMPT } from './game-sheet-translation.prompt'
import type { GameSheetTranslationOutput } from './game-sheet-translation.schema'
import { GameSheetTranslator } from './game-sheet-translator'

const gameId = '0195d1a2-0000-7000-8000-000000000001'
const config: AnthropicConfig = {
  apiKey: 'test',
  sheetModel: 'claude-opus-5-5',
  sheetTranslationModel: 'claude-haiku-5-5',
}

const sheet = new GameSheet(
  gameId,
  'fr',
  { localizedName: 'Dnup', edition: null, publisher: null, ruleBookUrl: null },
  { min: 2, max: 5, recommended: [] },
  8,
  { min: 20, max: 20 },
  'Description',
  [{ id: 'setup', order: 1, playerCounts: null, text: 'Mélangez.' }],
  {
    summary: 'Résumé',
    steps: [
      {
        id: 'turn',
        order: 1,
        playerCounts: null,
        optional: false,
        title: 'Jouer',
        text: 'Posez une carte.',
      },
    ],
  },
  [],
  {
    triggers: [{ id: 'end', playerCounts: null, text: 'Main vide.' }],
    timing: 'Immédiatement',
    scoring: [],
    winner: [],
  },
  'high',
  [],
  ['Avertissement'],
  'claude-opus-5-5',
  new Date('2026-01-01T00:00:00.000Z'),
)

const output: GameSheetTranslationOutput = {
  localized_name: 'Dnup',
  description: 'Description EN',
  turn_summary: 'Summary',
  end_timing: 'Immediately',
  warnings: ['Warning'],
  rules: [
    { id: 'setup', title: null, text: 'Shuffle.' },
    { id: 'turn', title: 'Play', text: 'Play a card.' },
    { id: 'end', title: null, text: 'Empty hand.' },
  ],
}

function response(overrides: Record<string, unknown> = {}) {
  return {
    model: 'claude-haiku-5-5',
    stop_reason: 'end_turn',
    stop_details: null,
    parsed_output: output,
    usage: { input_tokens: 10, output_tokens: 20 },
    ...overrides,
  }
}

describe('GameSheetTranslator', () => {
  const parse = vi.fn()
  const client = { messages: { parse } } as unknown as Anthropic
  const translator = new GameSheetTranslator(
    client,
    config,
    mockLoggerService as unknown as LoggerService,
  )

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('exposes the translation model', () => {
    expect(translator.model).toBe('claude-haiku-5-5')
  })

  it('translates the sheet in a single call without web tools', async () => {
    parse.mockResolvedValue(response())

    const translation = await translator.translate(sheet, 'en')

    expect(parse).toHaveBeenCalledTimes(1)
    const request = parse.mock.calls[0][0]
    expect(request).toMatchObject({
      model: 'claude-haiku-5-5',
      system: GAME_SHEET_TRANSLATION_SYSTEM_PROMPT,
    })
    expect(request.tools).toBeUndefined()
    const prompt = request.messages[0].content
    expect(prompt).toContain('Source language: fr')
    expect(prompt).toContain('Target language: en')
    expect(prompt).toContain('"id": "turn"')

    expect(translation).toEqual(
      new GameSheetTranslation(
        gameId,
        'fr',
        'en',
        'Dnup',
        'Description EN',
        'Summary',
        'Immediately',
        ['Warning'],
        output.rules,
      ),
    )
  })

  it.each([
    ['a missing rule', { rules: output.rules.slice(1) }],
    [
      'an unknown rule',
      { rules: [...output.rules, { id: 'x', title: null, text: 'x' }] },
    ],
    ['a duplicated rule', { rules: [...output.rules, output.rules[0]] }],
    ['a different warning count', { warnings: [] }],
  ])('fails with GAME_SHEET_TRANSLATION_FAILED on %s', async (_, changes) => {
    parse.mockResolvedValue(
      response({ parsed_output: { ...output, ...changes } }),
    )

    const error = await translator.translate(sheet, 'en').catch((e) => e)

    expect(error).toBeInstanceOf(InternalError)
    expect(error.code).toBe(ErrorCode.GAME_SHEET_TRANSLATION_FAILED)
  })

  it.each([
    ['a truncated output', { stop_reason: 'max_tokens' }],
    ['an unparsed output', { parsed_output: null }],
  ])('fails on %s', async (_, overrides) => {
    parse.mockResolvedValue(response(overrides))

    await expect(translator.translate(sheet, 'en')).rejects.toMatchObject({
      code: ErrorCode.GAME_SHEET_TRANSLATION_FAILED,
    })
  })

  it('wraps Anthropic API errors', async () => {
    parse.mockRejectedValue(
      new Anthropic.APIError(529, undefined, 'Overloaded', new Headers()),
    )

    const error = await translator.translate(sheet, 'en').catch((e) => e)

    expect(error).toBeInstanceOf(InternalError)
    expect(error.code).toBe(ErrorCode.GAME_SHEET_TRANSLATION_FAILED)
    expect(error.details).toMatchObject({ status: 529 })
  })
})
