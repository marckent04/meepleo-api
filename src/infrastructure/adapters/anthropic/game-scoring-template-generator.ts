import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { Inject, Injectable } from '@nestjs/common'
import type { ConfigType } from '@nestjs/config'
import { LoggerService } from '@/infrastructure/logger/logger.service'
import { ANTHROPIC_CONFIG } from '@/shared/config'
import { AiCallFailedError, ErrorCode, InternalError } from '@/shared/errors'
import {
  type AiTrace,
  type GameSheet,
  SCORING_HINT_MAX_LENGTH,
  SCORING_LABEL_MAX_LENGTH,
  SCORING_MAX_ABS_VALUE,
  SCORING_MAX_ROUNDS,
  SCORING_MAX_ROWS,
  SCORING_ROW_KEY_PATTERN,
  SCORING_TIE_BREAKER_MAX_LENGTH,
  type ScoringRow,
  type ScoringTemplate,
  type Traced,
} from '@/shared/types'
import {
  AiTraceRecorder,
  promptVersion,
  toAiCallSettings,
} from './ai-trace.util'
import { ANTHROPIC_CLIENT, cachedSystemPrompt } from './anthropic.client'
import {
  buildGameScoringUserPrompt,
  GAME_SCORING_SYSTEM_PROMPT,
} from './game-scoring.prompt'
import {
  type GameScoringOutput,
  GameScoringOutputSchema,
} from './game-scoring.schema'

const MAX_TOKENS = 4_000
const EFFORT = 'low'

const OUTPUT_FORMAT = zodOutputFormat(GameScoringOutputSchema)
const PROMPT_VERSION = promptVersion(GAME_SCORING_SYSTEM_PROMPT, OUTPUT_FORMAT)
const SETTINGS = toAiCallSettings({ effort: EFFORT, maxTokens: MAX_TOKENS })

function text(value: string, maxLength: number): string | null {
  const trimmed = value.trim().slice(0, maxLength).trim()
  return trimmed === '' ? null : trimmed
}

function clamp(value: number, max: number): number {
  return Math.max(-max, Math.min(max, Math.trunc(value)))
}

/** Valid, unique camelCase key; falls back to `row<n>`. */
function uniqueKey(key: string, index: number, used: Set<string>): string {
  const base = SCORING_ROW_KEY_PATTERN.test(key) ? key : `row${index + 1}`
  let candidate = base
  for (let suffix = 2; used.has(candidate); suffix++) {
    candidate = `${base.slice(0, 36)}${suffix}`
  }
  used.add(candidate)
  return candidate
}

/**
 * Template from the model output, made consistent where the model may
 * slip (empty texts, invalid keys, `pointsEach` of a points row…). The
 * domain still validates it before saving.
 */
export function toGeneratedScoringTemplate(
  output: GameScoringOutput,
): ScoringTemplate {
  const manual = output.outcome === 'manual'
  const used = new Set<string>()
  const rows = manual
    ? []
    : output.rows.slice(0, SCORING_MAX_ROWS).map((row, index): ScoringRow => {
        const key = uniqueKey(row.key, index, used)
        const pointsEach = clamp(row.points_each, SCORING_MAX_ABS_VALUE)
        return {
          key,
          label: text(row.label, SCORING_LABEL_MAX_LENGTH) ?? key,
          hint: text(row.hint, SCORING_HINT_MAX_LENGTH),
          input: row.input,
          pointsEach:
            row.input === 'points' || pointsEach === 0 ? 1 : pointsEach,
          exclusive: row.input === 'toggle' && row.exclusive,
        }
      })
  const roundCount =
    output.round_count >= 1 && output.round_count <= SCORING_MAX_ROUNDS
      ? output.round_count
      : null
  return {
    sides: output.sides,
    outcome: output.outcome,
    rounds:
      manual || output.rounds === 'none'
        ? null
        : { count: output.rounds === 'fixed' ? roundCount : null },
    targetScore:
      manual || output.target_score === 0
        ? null
        : clamp(output.target_score, SCORING_MAX_ABS_VALUE),
    rows,
    tieBreaker: text(output.tie_breaker, SCORING_TIE_BREAKER_MAX_LENGTH),
  }
}

/**
 * Derives the score sheet template of a game from its stored rule sheet,
 * without web tools: the scoring rules are already in the sheet. Texts are
 * written in the sheet language.
 */
@Injectable()
export class GameScoringTemplateGenerator {
  constructor(
    @Inject(ANTHROPIC_CLIENT) private readonly client: Anthropic,
    @Inject(ANTHROPIC_CONFIG.KEY)
    private readonly config: ConfigType<typeof ANTHROPIC_CONFIG>,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext(GameScoringTemplateGenerator.name)
  }

  /** AI model used to derive the templates. */
  get model(): string {
    return this.config.scoringModel
  }

  /**
   * Throws an AiCallFailedError carrying the trace (tokens consumed, raw
   * output…) on failure.
   */
  async generate(sheet: GameSheet): Promise<Traced<ScoringTemplate>> {
    const recorder = new AiTraceRecorder(this.model, PROMPT_VERSION, SETTINGS)
    try {
      const result = await this.run(sheet, recorder)
      const trace = recorder.trace()
      this.logTrace(sheet, trace)
      return { result, trace }
    } catch (cause) {
      const trace = recorder.trace()
      this.logTrace(sheet, trace)
      throw new AiCallFailedError({
        code: ErrorCode.GAME_SCORING_TEMPLATE_GENERATION_FAILED,
        trace,
        cause,
      })
    }
  }

  private async run(
    sheet: GameSheet,
    recorder: AiTraceRecorder,
  ): Promise<ScoringTemplate> {
    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: buildGameScoringUserPrompt(sheet) },
    ]
    const response = await recorder.call(() => this.request(messages))
    if (response.stop_reason !== 'end_turn' || !response.parsed_output) {
      throw new InternalError('Scoring template output is missing', {
        code: ErrorCode.GAME_SCORING_TEMPLATE_GENERATION_FAILED,
        details: {
          gameId: sheet.gameId,
          language: sheet.language,
          stopReason: response.stop_reason,
          stopDetails: response.stop_details ?? null,
        },
      })
    }
    return toGeneratedScoringTemplate(response.parsed_output)
  }

  /** The raw output is only kept in the database. */
  private logTrace(sheet: GameSheet, trace: AiTrace): void {
    const { output: _output, rawText: _rawText, ...summary } = trace
    this.logger.info({
      gameId: sheet.gameId,
      language: sheet.language,
      ...summary,
    })
  }

  private async request(messages: Anthropic.MessageParam[]) {
    try {
      return await this.client.messages.parse({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system: cachedSystemPrompt(GAME_SCORING_SYSTEM_PROMPT),
        messages,
        output_config: { effort: EFFORT, format: OUTPUT_FORMAT },
      })
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        throw new InternalError('Anthropic API call failed', {
          code: ErrorCode.GAME_SCORING_TEMPLATE_GENERATION_FAILED,
          details: { status: error.status, requestId: error.requestID },
          cause: error,
        })
      }
      throw error
    }
  }
}
