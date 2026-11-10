import type Anthropic from '@anthropic-ai/sdk'
import { mockLoggerService } from '@/__tests__/utils/logger-service.mock'
import type { LoggerService } from '@/infrastructure/logger/logger.service'
import type { AnthropicConfig } from '@/shared/config'
import { AiCallFailedError, ErrorCode, InternalError } from '@/shared/errors'
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
  sheetEffort: 'medium',
  sheetTranslationModel: 'claude-haiku-5-5',
  scoringModel: 'claude-haiku-5-5',
  barcodeModel: 'claude-haiku-5-5',
  barcodeEffort: 'low',
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
  const sheetConfig = { failureCooldownSeconds: 120 }
  const parse = vi.fn()
  const client = { messages: { parse } } as unknown as Anthropic
  const generator = new GameSheetGenerator(
    client,
    config,
    sheetConfig,
    mockLoggerService as unknown as LoggerService,
  )

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('asks the model with web tools and maps the structured output', async () => {
    parse.mockResolvedValue(response())

    const { result: sheet, trace } = await generator.generate(game, 'fr')

    expect(parse).toHaveBeenCalledTimes(1)
    const request = parse.mock.calls[0][0]
    expect(request).toMatchObject({
      model: 'claude-haiku-5-5',
      system: [
        {
          type: 'text',
          text: GAME_SHEET_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
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
      game: { edition: null, publisher: null },
      players: { min: 2, max: 5 },
      minAge: 8,
    })
    expect(sheet.setup[0]).toEqual({
      id: 'setup-1',
      order: 1,
      playerCounts: [5],
      text: 'Gardez les 40 cartes du paquet.',
    })
    expect(
      sheet.setup.find((s) => s.id !== 'setup-1' && s.playerCounts === null),
    ).toBeDefined()
    expect(sheet.turn.steps.map((s) => s.id)).toEqual([
      'turn-1',
      'turn-2',
      'turn-3',
      'turn-4',
      'turn-5',
      'turn-6',
    ])
    expect(sheet.endOfGame.winner.map((w) => w.id)).toEqual([
      'winner-1',
      'winner-2',
    ])
    expect(sheet.specialRules[0].title).toBe('Le doup')
    expect(sheet.variants.map((v) => v.id)).toEqual(['variant-1'])

    expect(trace).toMatchObject({
      model: 'claude-haiku-5-5',
      requestCount: 1,
      stopReason: 'end_turn',
      output: dnupOutput,
      rawText: null,
      promptVersion: expect.stringMatching(/^[0-9a-f]{12}$/),
      settings: {
        effort: 'medium',
        maxTokens: 16_000,
        tools: [
          { name: 'web_search', maxUses: 5 },
          { name: 'web_fetch', maxUses: 3 },
        ],
      },
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 0,
        webSearchRequests: 0,
        webFetchRequests: 0,
      },
    })
    expect(trace.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('keeps the confirmed title of each supported language', async () => {
    const output = {
      ...dnupOutput,
      game: {
        ...dnupOutput.game,
        localized_names:
          '- FR : Les Aventuriers du Rail\nen: Ticket to Ride\nde: Zug um Zug\nfr: Autre\nen:  \nnot a line',
      },
    }
    parse.mockResolvedValue(response({ parsed_output: output }))

    const { result: sheet } = await generator.generate(game, 'fr')

    expect(parse.mock.calls[0][0].messages[0].content).toContain(
      'Title languages: fr, en',
    )
    expect(sheet.game.localizedNames).toEqual({
      fr: 'Les Aventuriers du Rail',
      en: 'Ticket to Ride',
    })
  })

  it('keeps the box cover image URL found', async () => {
    parse.mockResolvedValue(response())

    const { result: sheet } = await generator.generate(game, 'fr')

    expect(sheet.game.imageUrl).toBe(
      'https://cf.geekdo-images.com/dnup/pic123.jpg',
    )
  })

  it.each([
    ['empty', ''],
    ['not a URL', 'the box cover'],
    ['relative', '/images/dnup.jpg'],
    ['not http(s)', 'data:image/png;base64,AAAA'],
  ])('ignores a %s image URL', async (_, imageUrl) => {
    const output = {
      ...dnupOutput,
      game: { ...dnupOutput.game, image_url: imageUrl },
    }
    parse.mockResolvedValue(response({ parsed_output: output }))

    const { result: sheet } = await generator.generate(game, 'fr')

    expect(sheet.game.imageUrl).toBeNull()
  })

  it('gives the known rulebook URL and the configured effort', async () => {
    parse.mockResolvedValue(response())
    const known = new Game(
      game.id,
      'Dnup',
      2021,
      null,
      null,
      123,
      'https://example.com/dnup.pdf',
    )
    const lowEffort = new GameSheetGenerator(
      client,
      { ...config, sheetEffort: 'low' },
      sheetConfig,
      mockLoggerService as unknown as LoggerService,
    )

    const { trace } = await lowEffort.generate(known, 'fr')

    const request = parse.mock.calls[0][0]
    expect(request.messages[0].content).toContain(
      'Known rulebook URL: https://example.com/dnup.pdf',
    )
    expect(request.output_config.effort).toBe('low')
    expect(trace.settings.effort).toBe('low')
  })

  it('does not mention a rulebook URL when none is known', async () => {
    parse.mockResolvedValue(response())

    await generator.generate(game, 'fr')

    expect(parse.mock.calls[0][0].messages[0].content).not.toContain(
      'rulebook URL',
    )
  })

  it('keeps the same prompt version between calls', async () => {
    parse.mockResolvedValue(response())

    const first = await generator.generate(game, 'fr')
    const second = await generator.generate(game, 'en')

    expect(second.trace.promptVersion).toBe(first.trace.promptVersion)
  })

  it('resumes a paused server tool loop', async () => {
    const paused = response({
      stop_reason: 'pause_turn',
      content: [{ type: 'server_tool_use', id: 'srv_1', name: 'web_search' }],
      parsed_output: null,
    })
    parse.mockResolvedValueOnce(paused).mockResolvedValueOnce(
      response({
        model: 'claude-haiku-5-5-20261001',
        usage: {
          input_tokens: 300,
          output_tokens: 400,
          cache_creation_input_tokens: 5,
          cache_read_input_tokens: 6,
          server_tool_use: { web_search_requests: 1, web_fetch_requests: 2 },
        },
      }),
    )

    const { trace } = await generator.generate(game, 'fr')

    expect(parse).toHaveBeenCalledTimes(2)
    // Usage accumulated over both calls, model of the last response.
    expect(trace).toMatchObject({
      model: 'claude-haiku-5-5-20261001',
      requestCount: 2,
      usage: {
        inputTokens: 310,
        outputTokens: 420,
        cacheCreationInputTokens: 5,
        cacheReadInputTokens: 6,
        webSearchRequests: 1,
        webFetchRequests: 2,
      },
    })
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

    expect(error).toBeInstanceOf(AiCallFailedError)
    expect(error.code).toBe(ErrorCode.GAME_SHEET_GENERATION_FAILED)
    expect(error.statusCode).toBe(500)
    expect(error.cause).toBeInstanceOf(InternalError)
    expect(error.trace).toMatchObject({ requestCount: 1, output: null })
    expect(error.trace.usage.inputTokens).toBe(10)
  })

  it('keeps the raw text of an output that could not be parsed', async () => {
    parse.mockResolvedValue(
      response({
        parsed_output: null,
        content: [{ type: 'text', text: 'Sorry, not JSON' }],
      }),
    )

    const error = await generator.generate(game, 'fr').catch((e) => e)

    expect(error.trace.rawText).toBe('Sorry, not JSON')
  })

  it('traces a failed API call', async () => {
    parse.mockRejectedValue(new Error('network down'))

    const error = await generator.generate(game, 'fr').catch((e) => e)

    expect(error).toBeInstanceOf(AiCallFailedError)
    expect(error.message).toBe('network down')
    expect(error.trace).toMatchObject({
      model: 'claude-haiku-5-5',
      requestCount: 1,
      stopReason: null,
      usage: { inputTokens: 0, outputTokens: 0 },
    })
  })

  it('gives up after too many pause_turn continuations', async () => {
    parse.mockResolvedValue(
      response({ stop_reason: 'pause_turn', parsed_output: null }),
    )

    const error = await generator.generate(game, 'fr').catch((e) => e)

    expect(error.code).toBe(ErrorCode.GAME_SHEET_GENERATION_FAILED)
    expect(parse).toHaveBeenCalledTimes(6)
    expect(error.trace.requestCount).toBe(6)
    expect(error.trace.usage.inputTokens).toBe(60)
  })
})
