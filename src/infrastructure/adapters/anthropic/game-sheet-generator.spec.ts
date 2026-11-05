import type Anthropic from '@anthropic-ai/sdk'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import type { LoggerService } from '@/infrastructure/logger/logger.service'
import type { AnthropicConfig } from '@/shared/config'
import { ErrorCode, InternalError } from '@/shared/errors'
import { Game, GameSheet } from '@/shared/types'
import dnupOutput from './__fixtures__/dnup-sheet.output.json'
import { GAME_SHEET_SYSTEM_PROMPT } from './game-sheet.prompt'
import { GameSheetGenerator } from './game-sheet-generator'

const game = new Game(
  '0195d1a2-0000-7000-8000-000000000001',
  'Dnup',
  2021,
  null,
  null,
  123,
)
const config: AnthropicConfig = {
  apiKey: 'test',
  sheetModel: 'claude-haiku-5-5',
}

function response(overrides: Record<string, unknown> = {}) {
  return {
    model: 'claude-haiku-5-5',
    stop_reason: 'end_turn',
    stop_details: null,
    content: [{ type: 'text', text: JSON.stringify(dnupOutput) }],
    parsed_output: dnupOutput,
    usage: { input_tokens: 10, output_tokens: 20 },
    ...overrides,
  }
}

describe('GameSheetGenerator', () => {
  const parse = vi.fn()
  const client = { messages: { parse } } as unknown as Anthropic
  const generator = new GameSheetGenerator(
    client,
    config,
    mockLoggerService as unknown as LoggerService,
  )

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('asks the model with web tools and maps the structured output', async () => {
    parse.mockResolvedValue(response())

    const sheet = await generator.generate(game, 'fr')

    expect(parse).toHaveBeenCalledTimes(1)
    const request = parse.mock.calls[0][0]
    expect(request).toMatchObject({
      model: 'claude-haiku-5-5',
      system: GAME_SHEET_SYSTEM_PROMPT,
      output_config: { effort: 'medium' },
    })
    expect(request.tools.map((t: { type: string }) => t.type)).toEqual([
      'web_search_20250305',
      'web_fetch_20250910',
    ])
    expect(request.messages[0].content).toContain('Game: Dnup (2021)')
    expect(request.messages[0].content).toContain('Sheet language: fr')

    expect(sheet).toBeInstanceOf(GameSheet)
    expect(sheet).toMatchObject({
      gameId: game.id,
      language: 'fr',
      generatedBy: 'claude-haiku-5-5',
      confidence: 'high',
      game: { localizedName: 'Dnup' },
      minAge: 8,
    })
    expect(sheet.setup[0]).toEqual({
      id: 'setup-1',
      order: 1,
      playerCounts: [5],
      text: 'Gardez les 40 cartes du paquet.',
    })
    expect(sheet.turn.steps).toHaveLength(6)
    expect(sheet.specialRules[0].title).toBe('Le doup')
  })

  it('resumes a paused server tool loop', async () => {
    const paused = response({
      stop_reason: 'pause_turn',
      content: [{ type: 'server_tool_use', id: 'srv_1', name: 'web_search' }],
      parsed_output: null,
    })
    parse.mockResolvedValueOnce(paused).mockResolvedValueOnce(response())

    await generator.generate(game, 'fr')

    expect(parse).toHaveBeenCalledTimes(2)
    const resumed = parse.mock.calls[1][0].messages
    expect(resumed).toHaveLength(2)
    expect(resumed[1]).toEqual({ role: 'assistant', content: paused.content })
  })

  it.each([
    ['a refusal', { stop_reason: 'refusal', parsed_output: null }],
    ['a truncated output', { stop_reason: 'max_tokens', parsed_output: null }],
    ['an unparsed output', { parsed_output: null }],
  ])('fails with GAME_SHEET_GENERATION_FAILED on %s', async (_, overrides) => {
    parse.mockResolvedValue(response(overrides))

    const error = await generator.generate(game, 'fr').catch((e) => e)

    expect(error).toBeInstanceOf(InternalError)
    expect(error.code).toBe(ErrorCode.GAME_SHEET_GENERATION_FAILED)
  })

  it('gives up after too many pause_turn continuations', async () => {
    parse.mockResolvedValue(
      response({ stop_reason: 'pause_turn', parsed_output: null }),
    )

    await expect(generator.generate(game, 'fr')).rejects.toMatchObject({
      code: ErrorCode.GAME_SHEET_GENERATION_FAILED,
    })
    expect(parse).toHaveBeenCalledTimes(6)
  })
})
