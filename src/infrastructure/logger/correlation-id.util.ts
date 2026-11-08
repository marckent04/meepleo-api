import { randomUUID } from 'node:crypto'
import type { IncomingHttpHeaders } from 'node:http'

export const CORRELATION_ID_KEY = 'correlationId'

const CORRELATION_ID = Symbol('correlationId')
const MAX_LENGTH = 128

type RequestLike = { headers: IncomingHttpHeaders; [CORRELATION_ID]?: string }

function headerValue(value: string | string[] | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  const trimmed = first?.trim()
  return trimmed && trimmed.length <= MAX_LENGTH ? trimmed : undefined
}

/**
 * Correlation id of the request: reuses `x-correlation-id` /
 * `x-request-id`, otherwise generates one. Memoized on the request so pino-http
 * and CLS share the same value.
 */
export function resolveCorrelationId(req: object): string {
  const request = req as RequestLike
  request[CORRELATION_ID] ??=
    headerValue(request.headers['x-correlation-id']) ??
    headerValue(request.headers['x-request-id']) ??
    randomUUID()
  return request[CORRELATION_ID]
}
