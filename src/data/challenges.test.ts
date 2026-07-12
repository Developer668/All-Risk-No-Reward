import { describe, expect, it } from 'vitest'
import { challenges, getDailyChallenge, getUnlockTime } from './challenges'

describe('daily challenge selection', () => {
  it('loads all 500 repository challenges with stable unique IDs', () => {
    expect(challenges).toHaveLength(500)
    expect(new Set(challenges.map(({ id }) => id)).size).toBe(500)
    expect(challenges.filter(({ difficulty }) => difficulty === 1)).toHaveLength(90)
    expect(challenges.filter(({ difficulty }) => difficulty === 2)).toHaveLength(95)
    expect(challenges.filter(({ difficulty }) => difficulty === 3)).toHaveLength(100)
    expect(challenges.filter(({ difficulty }) => difficulty === 4)).toHaveLength(105)
    expect(challenges.filter(({ difficulty }) => difficulty === 5)).toHaveLength(110)
  })

  it('preserves repository verification and consent metadata', () => {
    const challenge = challenges.find(({ id }) => id === 'medium-001')
    expect(challenge).toMatchObject({
      category: 'fitness',
      difficulty: 2,
      mode: 'group',
      requiresConsent: true,
      acceptedEvidence: ['image', 'video'],
    })
    expect(challenge?.successCriteria?.length).toBeGreaterThanOrEqual(2)
    expect(challenge?.boundaryTags).toEqual(expect.arrayContaining(['requires-consent', 'group-activity', 'physical-activity']))
  })

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
