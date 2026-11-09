import Anthropic from '@anthropic-ai/sdk'
import type { Provider } from '@nestjs/common'
import type { ConfigType } from '@nestjs/config'
import { ANTHROPIC_CONFIG } from '@/shared/config'

export const ANTHROPIC_CLIENT = Symbol('ANTHROPIC_CLIENT')

export const anthropicClientProvider: Provider = {
  provide: ANTHROPIC_CLIENT,
  inject: [ANTHROPIC_CONFIG.KEY],
  useFactory: (config: ConfigType<typeof ANTHROPIC_CONFIG>) =>
    new Anthropic({ apiKey: config.apiKey }),
}

/**
 * Wraps a frozen system prompt in a block carrying a cache breakpoint.
 * Tools render before the system prompt, so the cached prefix covers the
 * tools and the system prompt; the per-request variables stay in the user
 * message, after the breakpoint.
 */
export function cachedSystemPrompt(text: string): Anthropic.TextBlockParam[] {
  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }]
}
