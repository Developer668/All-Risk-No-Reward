import { describe, expect, it } from 'vitest'
import { getDailyChallenge, getUnlockTime } from './challenges'

describe('daily challenge selection', () => {
  it('is stable for the same day and level', () => {
    const date = new Date('2026-07-12T12:00:00Z')
    expect(getDailyChallenge(date, 2).id).toBe(getDailyChallenge(date, 2).id)
  })

  it('never assigns above the allowed progression band', () => {
    const date = new Date('2026-07-13T12:00:00Z')
    expect(getDailyChallenge(date, 1).difficulty).toBeLessThanOrEqual(2)
  })

  it('unlocks inside the configured daytime window', () => {
    const date = new Date(2026, 6, 12, 8, 0)
    const unlock = getUnlockTime(date)
    expect(unlock.getHours()).toBeGreaterThanOrEqual(10)
    expect(unlock.getHours()).toBeLessThan(18)
  })
})
