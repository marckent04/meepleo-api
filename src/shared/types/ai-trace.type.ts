/** Usage of one or more AI calls, accumulated. */
export type AiUsage = {
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  webSearchRequests: number
  webFetchRequests: number
}

/** Model call parameters, kept to compare attempts. */
export type AiCallSettings = {
  effort: string
  maxTokens: number
  tools: { name: string; maxUses: number | null }[]
}

/**
 * Trace of an AI operation (possibly several API calls):
 * kept with each aggregation to improve prompts and models.
 */
export type AiTrace = {
  /** Model actually used (`response.model`), otherwise the requested one. */
  model: string
  /** Fingerprint of the system prompt and the output schema. */
  promptVersion: string
  settings: AiCallSettings
  /** Nombre d'appels API (relances `pause_turn` comprises). */
  requestCount: number
  /** Accumulated duration of the API calls, in ms. */
  durationMs: number
  usage: AiUsage
  /** `stop_reason` of the last response. */
  stopReason: string | null
  /** Raw structured output of the model. */
  output: unknown
  /** Response text when the structured output could not be read. */
  rawText: string | null
}

/** Result of an AI operation along with its trace. */
export type Traced<T> = { result: T; trace: AiTrace }
