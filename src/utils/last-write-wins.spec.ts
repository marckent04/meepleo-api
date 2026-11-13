import {
  clampFutureDate,
  FUTURE_TOLERANCE_MS,
  resolveLastWriteWins,
} from './last-write-wins'

describe('resolveLastWriteWins', () => {
  const stored = new Date('2026-11-12T10:00:00Z')

  it('applies a write on a new entity', () => {
    expect(resolveLastWriteWins(stored, null)).toBe('apply')
  })

  it('applies a more recent write', () => {
    expect(resolveLastWriteWins(new Date('2026-11-12T10:00:01Z'), stored)).toBe(
      'apply',
    )
  })

  it('treats an equal date as an idempotent replay', () => {
    expect(resolveLastWriteWins(new Date(stored), stored)).toBe('unchanged')
  })

  it('reports a conflict for an older write', () => {
    expect(resolveLastWriteWins(new Date('2026-11-12T09:59:59Z'), stored)).toBe(
      'conflict',
    )
  })
})

describe('clampFutureDate', () => {
  const now = new Date('2026-11-12T10:00:00Z')

  it('keeps a past date', () => {
    const date = new Date('2026-11-12T09:00:00Z')
    expect(clampFutureDate(date, now)).toBe(date)
  })

  it('keeps a date within the tolerance', () => {
    const date = new Date(now.getTime() + FUTURE_TOLERANCE_MS)
    expect(clampFutureDate(date, now)).toBe(date)
  })

  it('brings a date too far in the future back to the reception time', () => {
    const date = new Date(now.getTime() + FUTURE_TOLERANCE_MS + 1)
    expect(clampFutureDate(date, now)).toBe(now)
  })
})
