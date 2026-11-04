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
 * Identifiant de corrélation de la requête : réutilise `x-correlation-id` /
 * `x-request-id` sinon en génère un. Mémoïsé sur la requête pour que pino-http
 * et CLS partagent la même valeur.
 */
export function resolveCorrelationId(req: object): string {
  const request = req as RequestLike
  request[CORRELATION_ID] ??=
    headerValue(request.headers['x-correlation-id']) ??
    headerValue(request.headers['x-request-id']) ??
    randomUUID()
  return request[CORRELATION_ID]
}
