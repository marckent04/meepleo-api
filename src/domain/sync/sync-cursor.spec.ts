import { BadRequestError } from '@/shared/errors'
import { decodeSyncCursor, encodeSyncCursor } from './sync-cursor'

describe('sync cursor', () => {
  it('round-trips a revision', () => {
    expect(decodeSyncCursor(encodeSyncCursor(42))).toBe(42)
  })

  it('starts from the beginning without a cursor', () => {
    expect(decodeSyncCursor(null)).toBe(0)
  })

  it.each(['not-a-cursor', encodeSyncCursor(-1), ''])(
    'rejects the invalid cursor %j',
    (cursor) => {
      expect(() => decodeSyncCursor(cursor)).toThrow(BadRequestError)
    },
  )
})
