import { BadRequestError } from '@/shared/errors'

/** Cursor of `sync/pull`: opaque to clients, it wraps a server revision. */
export function encodeSyncCursor(revision: number): string {
  return Buffer.from(JSON.stringify({ r: revision })).toString('base64url')
}

/** Revision of a cursor; 0 (everything) when absent. Throws BAD_REQUEST if invalid. */
export function decodeSyncCursor(cursor: string | null): number {
  if (cursor === null) return 0
  try {
    const { r } = JSON.parse(Buffer.from(cursor, 'base64url').toString())
    if (Number.isSafeInteger(r) && r >= 0) return r
  } catch {
    // Falls through to the error below.
  }
  throw new BadRequestError('Invalid sync cursor')
}
