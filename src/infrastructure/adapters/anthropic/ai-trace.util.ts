import { createHash } from 'node:crypto'
import type Anthropic from '@anthropic-ai/sdk'
import type { AiCallSettings, AiTrace, AiUsage } from '@/shared/types'

/**
 * Empreinte courte du prompt système et du format de sortie : change dès que
 * l'un des deux change, pour comparer les fiches produites par version.
 */
export function promptVersion(system: string, outputFormat: unknown): string {
  return createHash('sha256')
    .update(system)
    .update('\0')
    .update(JSON.stringify(outputFormat))
    .digest('hex')
    .slice(0, 12)
}

/** Paramètres d'appel, outils serveur compris (nom et plafond d'usage). */
export function toAiCallSettings(params: {
  effort: string
  maxTokens: number
  tools?: Anthropic.ToolUnion[]
}): AiCallSettings {
  return {
    effort: params.effort,
    maxTokens: params.maxTokens,
    tools: (params.tools ?? []).map((tool) => ({
      name: 'name' in tool ? tool.name : tool.type,
      maxUses:
        'max_uses' in tool && typeof tool.max_uses === 'number'
          ? tool.max_uses
          : null,
    })),
  }
}

type TracedResponse = Pick<
  Anthropic.Message,
  'model' | 'stop_reason' | 'usage' | 'content'
> & { parsed_output?: unknown }

/**
 * Accumule la trace d'une opération d'IA sur un ou plusieurs appels API :
 * durée, nombre d'appels, tokens, et sortie de la dernière réponse.
 */
export class AiTraceRecorder {
  private model: string
  private requestCount = 0
  private durationMs = 0
  private readonly usage: AiUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    webSearchRequests: 0,
    webFetchRequests: 0,
  }
  private stopReason: string | null = null
  private output: unknown = null
  private rawText: string | null = null

  constructor(
    model: string,
    private readonly promptVersion: string,
    private readonly settings: AiCallSettings,
  ) {
    this.model = model
  }

  /** Exécute un appel API en mesurant sa durée et en cumulant sa consommation. */
  async call<T extends TracedResponse>(request: () => Promise<T>): Promise<T> {
    this.requestCount++
    const start = performance.now()
    try {
      const response = await request()
      this.record(response)
      return response
    } finally {
      this.durationMs += performance.now() - start
    }
  }

  trace(): AiTrace {
    return {
      model: this.model,
      promptVersion: this.promptVersion,
      settings: this.settings,
      requestCount: this.requestCount,
      durationMs: Math.round(this.durationMs),
      usage: { ...this.usage },
      stopReason: this.stopReason,
      output: this.output,
      rawText: this.rawText,
    }
  }

  private record(response: TracedResponse): void {
    const { usage } = response
    this.usage.inputTokens += usage.input_tokens
    this.usage.outputTokens += usage.output_tokens
    this.usage.cacheCreationInputTokens +=
      usage.cache_creation_input_tokens ?? 0
    this.usage.cacheReadInputTokens += usage.cache_read_input_tokens ?? 0
    this.usage.webSearchRequests +=
      usage.server_tool_use?.web_search_requests ?? 0
    this.usage.webFetchRequests +=
      usage.server_tool_use?.web_fetch_requests ?? 0

    this.model = response.model
    this.stopReason = response.stop_reason
    this.output = response.parsed_output ?? null
    this.rawText =
      this.output === null ? textOf(response.content) || null : null
  }
}

function textOf(content: Anthropic.ContentBlock[]): string {
  return content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('\n')
}
