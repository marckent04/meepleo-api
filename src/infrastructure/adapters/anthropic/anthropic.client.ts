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
