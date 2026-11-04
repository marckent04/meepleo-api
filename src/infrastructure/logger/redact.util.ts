const SENSITIVE_KEY =
  /pass(word)?|token|secret|authorization|cookie|api[-_]?key|credential/i

export const REDACTED = '[REDACTED]'

/** Masque récursivement les valeurs des clés sensibles avant de les logger. */
export function redactSecrets<T>(value: T): T {
  return redact(value, new WeakSet()) as T
}

function redact(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date) return value
  if (seen.has(value)) return '[Circular]'
  seen.add(value)

  if (Array.isArray(value)) return value.map((item) => redact(item, seen))

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : redact(entry, seen),
    ]),
  )
}
