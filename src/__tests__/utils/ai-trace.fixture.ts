import type { AiTrace } from '@/shared/types'

/** Plausible AI trace; override the fields useful to the test. */
export function buildAiTrace(overrides: Partial<AiTrace> = {}): AiTrace {
  return {
    model: 'claude-haiku-5-5',
    promptVersion: 'abc123def456',
    settings: { effort: 'medium', maxTokens: 16_000, tools: [] },
    requestCount: 1,
    durationMs: 1234,
    usage: {
      inputTokens: 1000,
      outputTokens: 500,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      webSearchRequests: 0,
      webFetchRequests: 0,
    },
    stopReason: 'end_turn',
    output: { ok: true },
    rawText: null,
    ...overrides,
  }
}
