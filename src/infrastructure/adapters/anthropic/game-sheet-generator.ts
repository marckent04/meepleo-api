import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { Inject, Injectable } from '@nestjs/common'
import type { ConfigType } from '@nestjs/config'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { ANTHROPIC_CONFIG } from '@/shared/config'
import { AiCallFailedError, ErrorCode, InternalError } from '@/shared/errors'
import { isSupportedLocale } from '@/shared/i18n/locale'
import {
  type AiTrace,
  type Game,
  GameSheet,
  type GeneratedGameSheet,
  type Traced,
} from '@/shared/types'
import {
  AiTraceRecorder,
  promptVersion,
  toAiCallSettings,
} from './ai-trace.util'
import { ANTHROPIC_CLIENT, cachedSystemPrompt } from './anthropic.client'
import {
  buildGameSheetUserPrompt,
  GAME_SHEET_SYSTEM_PROMPT,
} from './game-sheet.prompt'
import {
  type GameSheetOutput,
  GameSheetOutputSchema,
} from './game-sheet.schema'

/** Maximum retries when the server tool loop is interrupted (`pause_turn`). */
const MAX_CONTINUATIONS = 5
const MAX_TOKENS = 16_000

/**
 * Base variants: the `_20260209` variants (dynamic filtering) do not
 * support Claude Haiku 5.5. No `citations`: incompatible
 * with structured outputs.
 */
const WEB_TOOLS: Anthropic.ToolUnion[] = [
  { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
  {
    type: 'web_fetch_20250910',
    name: 'web_fetch',
    max_uses: 3,
    max_content_tokens: 60_000,
  },
]

const OUTPUT_FORMAT = zodOutputFormat(GameSheetOutputSchema)
const PROMPT_VERSION = promptVersion(GAME_SHEET_SYSTEM_PROMPT, OUTPUT_FORMAT)

/** Generates a rule sheet: web search for a rulebook, then typed extraction. */
@Injectable()
export class GameSheetGenerator {
  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly client: Anthropic,
    @Inject(ANTHROPIC_CONFIG.KEY)
    private readonly config: ConfigType<typeof ANTHROPIC_CONFIG>,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(GameSheetGenerator.name)
  }

  /** AI model used to generate the sheets. */
  get model(): string {
    return this.config.sheetModel
  }

  /**
   * Throws an AiCallFailedError carrying the trace (tokens consumed, raw
   * output…) on failure, including after successful calls.
   */
  async generate(
    game: Game,
    language: string,
  ): Promise<Traced<GeneratedGameSheet>> {
    const recorder = new AiTraceRecorder(
      this.model,
      PROMPT_VERSION,
      toAiCallSettings({
        effort: this.config.sheetEffort,
        maxTokens: MAX_TOKENS,
        tools: WEB_TOOLS,
      }),
    )
    try {
      const result = await this.run(game, language, recorder)
      const trace = recorder.trace()
      this.logTrace(game, language, trace)
      return { result, trace }
    } catch (cause) {
      const trace = recorder.trace()
      this.logTrace(game, language, trace)
      throw new AiCallFailedError({
        code: ErrorCode.GAME_SHEET_GENERATION_FAILED,
        trace,
        cause,
      })
    }
  }

  private async run(
    game: Game,
    language: string,
    recorder: AiTraceRecorder,
  ): Promise<GeneratedGameSheet> {
    const model = this.model
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: buildGameSheetUserPrompt(game, language) },
    ]

    let response = await recorder.call(() => this.request(model, messages))
    for (let i = 0; response.stop_reason === 'pause_turn'; i++) {
      if (i >= MAX_CONTINUATIONS) {
        throw this.failure('Too many pause_turn continuations', game, response)
      }
      // Resuming happens on the final server_tool_use block, without a new user message.
      messages.push({ role: 'assistant', content: response.content })
      response = await recorder.call(() => this.request(model, messages))
    }

    if (response.stop_reason !== 'end_turn') {
      throw this.failure(`Unexpected stop reason`, game, response)
    }
    if (!response.parsed_output) {
      throw this.failure(
        'Structured output could not be parsed',
        game,
        response,
      )
    }
    return toGameSheet(game, language, response.model, response.parsed_output)
  }

  /** The bulky raw output is only kept in the database. */
  private logTrace(game: Game, language: string, trace: AiTrace): void {
    const { output: _output, rawText: _rawText, ...summary } = trace
    this.logger.info({ gameId: game.id, language, ...summary })
  }

  private async request(model: string, messages: Anthropic.MessageParam[]) {
    try {
      return await this.client.messages.parse({
        model,
        max_tokens: MAX_TOKENS,
        system: cachedSystemPrompt(GAME_SHEET_SYSTEM_PROMPT),
        messages,
        tools: WEB_TOOLS,
        output_config: {
          effort: this.config.sheetEffort,
          format: OUTPUT_FORMAT,
        },
      })
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new InternalError('Anthropic API call failed', {
          code: ErrorCode.GAME_SHEET_GENERATION_FAILED,
          details: { status: error.status, requestId: error.requestID },
          cause: error,
        })
      }
      throw error
    }
  }

  private failure(
    message: string,
    game: Game,
    response: { stop_reason: string | null; stop_details?: unknown },
  ): InternalError {
    return new InternalError(message, {
      code: ErrorCode.GAME_SHEET_GENERATION_FAILED,
      details: {
        gameId: game.id,
        stopReason: response.stop_reason,
        stopDetails: response.stop_details ?? null,
      },
    })
  }
}

/** The schema has no nullable field: `''` and `0` mean "unknown". */
const textOrNull = (value: string): string | null => value.trim() || null
const intOrNull = (value: number): number | null => (value > 0 ? value : null)

/**
 * One title per line in the output; returns them trimmed (list bullets
 * removed), non-empty, deduplicated (case-insensitive), catalog name excluded.
 */
export function parseAlternativeNames(
  names: string,
  catalogName: string,
): string[] {
  const seen = new Set([catalogName.trim().toLowerCase()])
  return names.split(/\r?\n/).flatMap((name) => {
    const trimmed = name.replace(/^\s*[-*•]\s+/, '').trim()
    const key = trimmed.toLowerCase()
    if (!trimmed || seen.has(key)) return []
    seen.add(key)
    return [trimmed]
  })
}

/**
 * One "<language code>: <title>" line per language in the output; keeps the
 * supported languages only, the first title of each.
 */
export function parseLocalizedNames(names: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of names.split(/\r?\n/)) {
    const match = /^\s*(?:[-*•]\s+)?([a-z]{2})\s*:\s*(.+)$/i.exec(line)
    if (!match) continue
    const language = match[1].toLowerCase()
    const title = match[2].trim()
    if (isSupportedLocale(language) && title && !(language in result)) {
      result[language] = title
    }
  }
  return result
}

/**
 * The localized titles are also alternative names, so that a search in any
 * language finds the game.
 */
export function toGameSheet(
  game: Game,
  language: string,
  model: string,
  output: GameSheetOutput,
): GeneratedGameSheet {
  // Positional identifiers (`setup-1`, `turn-2`…): stable and unique
  // per section, without asking the model for them.
  const entry =
    (prefix: string) =>
    (e: { player_counts: number[]; text: string }, index: number) => ({
      id: `${prefix}-${index + 1}`,
      playerCounts: e.player_counts.length > 0 ? e.player_counts : null,
      text: e.text,
    })
  const ofKind = (kind: 'special' | 'variant') =>
    output.special_rules.filter((r) => r.kind === kind)
  const localizedNames = parseLocalizedNames(output.game.localized_names)
  return new GameSheet(
    game.id,
    language,
    {
      localizedNames,
      alternativeNames: parseAlternativeNames(
        [output.game.alternative_names, ...Object.values(localizedNames)].join(
          '\n',
        ),
        game.name,
      ),
      edition: textOrNull(output.game.edition),
      publisher: textOrNull(output.game.publisher),
      ruleBookUrl: textOrNull(output.game.rule_book_url),
    },
    {
      min: intOrNull(output.players.min),
      max: intOrNull(output.players.max),
    },
    intOrNull(output.min_age),
    {
      min: intOrNull(output.duration_minutes.min),
      max: intOrNull(output.duration_minutes.max),
    },
    output.description,
    output.setup.map((s, i) => ({ ...entry('setup')(s, i), order: s.order })),
    {
      summary: output.turn.summary,
      steps: output.turn.steps.map((s, i) => ({
        ...entry('turn')(s, i),
        order: s.order,
        optional: s.optional,
        title: s.title,
      })),
    },
    ofKind('special').map((r, i) => ({
      ...entry('rule')(r, i),
      title: r.title,
    })),
    ofKind('variant').map((r, i) => ({
      ...entry('variant')(r, i),
      title: r.title,
    })),
    {
      triggers: output.end_of_game.triggers.map(entry('end')),
      timing: output.end_of_game.timing,
      scoring: output.end_of_game.scoring.map((s, i) => ({
        ...entry('score')(s, i),
        order: s.order,
        title: s.title,
      })),
      winner: output.end_of_game.winner.map(entry('winner')),
    },
    output.confidence,
    output.sources,
    output.warnings,
    model,
    new Date(),
  )
}
