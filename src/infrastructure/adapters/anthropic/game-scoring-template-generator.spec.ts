import type Anthropic from '@anthropic-ai/sdk'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import type { LoggerService } from '@/infrastructure/logger/logger.service'
import type { AnthropicConfig } from '@/shared/config'
import { AiCallFailedError, ErrorCode } from '@/shared/errors'
import { GameSheet } from '@/shared/types'
import { GAME_SCORING_SYSTEM_PROMPT } from './game-scoring.prompt'
import type { GameScoringOutput } from './game-scoring.schema'
import {
  GameScoringTemplateGenerator,
  toGeneratedScoringTemplate,
} from './game-scoring-template-generator'

const gameId = '0195d1a2-0000-7000-8000-000000000001'
const config: AnthropicConfig = {
  apiKey: 'test',
  sheetModel: 'claude-opus-5-5',
  sheetEffort: 'medium',
  sheetTranslationModel: 'claude-haiku-5-5',
  scoringModel: 'claude-haiku-5-5',
  barcodeModel: 'claude-haiku-5-5',
  barcodeEffort: 'low',
}

const sheet = new GameSheet(
  gameId,
  'fr',
  {
    localizedName: '6 qui prend !',
    edition: null,
    publisher: null,
    ruleBookUrl: null,
    imageUrl: null,
  },
  { min: 2, max: 10 },
  8,
  { min: 45, max: 45 },
  'Description',
  [],
  { summary: 'Posez une carte.', steps: [] },
  [],
  [],
  {
    triggers: [{ id: 't', playerCounts: null, text: 'Un joueur atteint 66.' }],
    timing: 'Fin de manche',
    scoring: [
      {
        id: 's',
        order: 1,
        playerCounts: null,
        title: 'Têtes de bœuf',
        text: 'Comptez vos têtes.',
      },
    ],
    winner: [{ id: 'w', playerCounts: null, text: 'Le moins de têtes gagne.' }],
  },
  'high',
  [],
  [],
  'claude-opus-5-5',
  new Date('2026-01-01T00:00:00.000Z'),
)

const output: GameScoringOutput = {
  sides: 'individual',
  outcome: 'lowest',
  rounds: 'free',
  round_count: 0,
  target_score: 66,
  rows: [],
  tie_breaker: '',
}

function response(overrides: Record<string, unknown> = {}) {
  return {
    model: 'claude-haiku-5-5',
    stop_reason: 'end_turn',
    stop_details: null,
    content: [{ type: 'text', text: JSON.stringify(output) }],
    parsed_output: output,
    usage: { input_tokens: 10, output_tokens: 20 },
    ...overrides,
  }
}

function row(overrides: Partial<GameScoringOutput['rows'][number]> = {}) {
  return {
    key: 'cities',
    label: 'Villes',
    hint: '',
    input: 'count' as const,
    points_each: 2,
    exclusive: false,
    ...overrides,
  }
}

describe('toGeneratedScoringTemplate', () => {
  it('maps free rounds and the target score', () => {
    expect(toGeneratedScoringTemplate(output)).toEqual({
      sides: 'individual',
      outcome: 'lowest',
      rounds: { count: null },
      targetScore: 66,
      rows: [],
      tieBreaker: null,
    })
  })

  it('keeps the count of fixed rounds', () => {
    expect(
      toGeneratedScoringTemplate({ ...output, rounds: 'fixed', round_count: 3 })
        .rounds,
    ).toEqual({ count: 3 })
  })

  it('drops the score sheet of a manual outcome', () => {
    expect(
      toGeneratedScoringTemplate({
        ...output,
        outcome: 'manual',
        rows: [row()],
      }),
    ).toMatchObject({ rounds: null, targetScore: null, rows: [] })
  })

  it('makes the rows consistent', () => {
    const template = toGeneratedScoringTemplate({
      ...output,
      rounds: 'none',
      rows: [
        row({ label: '  ', hint: ' 2 points par ville ' }),
        row({
          key: 'cities',
          input: 'points',
          points_each: 3,
          exclusive: true,
        }),
        row({ key: 'Longest Road', input: 'toggle', exclusive: true }),
        row({ key: 'zero', points_each: 0 }),
      ],
      tie_breaker: ' Le plus de villes ',
    })

    expect(template.rows).toEqual([
      {
        key: 'cities',
        label: 'cities',
        hint: '2 points par ville',
        input: 'count',
        pointsEach: 2,
        exclusive: false,
      },
      {
        key: 'cities2',
        label: 'Villes',
        hint: null,
        input: 'points',
        pointsEach: 1,
        exclusive: false,
      },
      {
        key: 'row3',
        label: 'Villes',
        hint: null,
        input: 'toggle',
        pointsEach: 2,
        exclusive: true,
      },
      {
        key: 'zero',
        label: 'Villes',
        hint: null,
        input: 'count',
        pointsEach: 1,
        exclusive: false,
      },
    ])
    expect(template.tieBreaker).toBe('Le plus de villes')
  })
})

describe('GameScoringTemplateGenerator', () => {
  const parse = vi.fn()
  const client = { messages: { parse } } as unknown as Anthropic
  const generator = new GameScoringTemplateGenerator(
    client,
    config,
    mockLoggerService as unknown as LoggerService,
  )

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('exposes the scoring model', () => {
    expect(generator.model).toBe('claude-haiku-5-5')
  })

  it('derives the template from the sheet without web tools', async () => {
    parse.mockResolvedValue(response())

    const { result, trace } = await generator.generate(sheet)

    const request = parse.mock.calls[0][0]
    expect(request).toMatchObject({
      model: 'claude-haiku-5-5',
      system: [
        {
          type: 'text',
          text: GAME_SCORING_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
    })
    expect(request).not.toHaveProperty('tools')
    const prompt = request.messages[0].content
    expect(prompt).toContain('Game: 6 qui prend !')
    expect(prompt).toContain('Sheet language: fr')
    expect(prompt).toContain('Comptez vos têtes.')
    expect(result).toMatchObject({ outcome: 'lowest', targetScore: 66 })
    expect(trace).toMatchObject({
      model: 'claude-haiku-5-5',
      stopReason: 'end_turn',
      output,
      settings: { effort: 'low', maxTokens: 4_000, tools: [] },
    })
  })

  it.each([
    ['a truncated output', { stop_reason: 'max_tokens' }],
    ['an unparsed output', { parsed_output: null }],
  ])('fails with its trace on %s', async (_, overrides) => {
    parse.mockResolvedValue(response(overrides))

    const error = await generator.generate(sheet).catch((e) => e)

    expect(error).toBeInstanceOf(AiCallFailedError)
    expect(error.code).toBe(ErrorCode.GAME_SCORING_TEMPLATE_GENERATION_FAILED)
    expect(error.trace.requestCount).toBe(1)
  })
})
