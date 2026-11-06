/** Consommation d'un ou plusieurs appels à l'IA, cumulée. */
export type AiUsage = {
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheReadInputTokens: number
  webSearchRequests: number
  webFetchRequests: number
}

/** Paramètres d'appel au modèle, conservés pour comparer les essais. */
export type AiCallSettings = {
  effort: string
  maxTokens: number
  tools: { name: string; maxUses: number | null }[]
}

/**
 * Trace d'une opération d'IA (éventuellement plusieurs appels API) :
 * conservée avec chaque agrégation pour améliorer prompts et modèles.
 */
export type AiTrace = {
  /** Modèle effectivement utilisé (`response.model`), sinon celui demandé. */
  model: string
  /** Empreinte du prompt système et du schéma de sortie. */
  promptVersion: string
  settings: AiCallSettings
  /** Nombre d'appels API (relances `pause_turn` comprises). */
  requestCount: number
  /** Durée cumulée des appels API, en ms. */
  durationMs: number
  usage: AiUsage
  /** `stop_reason` de la dernière réponse. */
  stopReason: string | null
  /** Sortie structurée brute du modèle. */
  output: unknown
  /** Texte de la réponse quand la sortie structurée n'a pas pu être lue. */
  rawText: string | null
}

/** Résultat d'une opération d'IA accompagné de sa trace. */
export type Traced<T> = { result: T; trace: AiTrace }
