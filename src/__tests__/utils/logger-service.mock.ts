import type { LoggerService } from '@/infrastructure/logger/logger.service'

export const mockLoggerService = {
  setContext: vi.fn(),
  assign: vi.fn(),
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
} satisfies Record<keyof LoggerService, unknown>
