import { describe, expect, it } from 'vitest'
import type { DailyView } from '../types'
import {
  completeBonusChallenge,
  loadBonusState,
  rollFastFinishBonus,
  spendLifeline,
  type BonusStorage,
} from './bonusChallenge'

class MemoryStorage implements BonusStorage {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

function completedDaily(completedAt: string): DailyView {
  return {
    dateKey: '2026-07-12',
    status: 'completed',
    unreadNotificationCount: 0,
    assignment: {
      id: 'assignment-1',
      userId: 'user-1',
      dateKey: '2026-07-12',
      challengeId: 'challenge-1',
      status: 'completed',
      unlockAt: '2026-07-12T20:00:00.000Z',
      deadlineAt: '2026-07-13T05:00:00.000Z',
      createdAt: '2026-07-12T17:00:00.000Z',
    },
    challenge: {
      id: 'challenge-1',
      title: 'Fast test',
      prompt: 'Do the test.',
      why: 'It tests the feature.',
      category: 'warm-up',
      difficulty: 1,
      minutes: 5,
      proofHint: 'Describe it.',
    },
    completion: {
      challengeId: 'challenge-1',
      score: 90,
      note: 'Completed with enough observable detail.',
      completedAt,
      verdict: 'complete',
      pointsAwarded: 120,
    },
  }
}

describe('fast-finish bonus challenge', () => {
  it('offers a persisted bonus only when a full completion is unusually fast', () => {
    const storage = new MemoryStorage()
    const fast = completedDaily('2026-07-12T20:04:00.000Z')
    const offered = rollFastFinishBonus('user-1', fast, storage, () => 0)

    expect(offered).toMatchObject({ assignmentId: 'assignment-1', status: 'offered' })
    expect(rollFastFinishBonus('user-1', fast, storage, () => 0.99)).toEqual(offered)

    const slowStorage = new MemoryStorage()
    const slow = completedDaily('2026-07-12T20:06:00.000Z')
    expect(rollFastFinishBonus('user-1', slow, slowStorage, () => 0)).toBeUndefined()
  })

  it('persists no-offer rolls so refreshing cannot reroll the result', () => {
    const storage = new MemoryStorage()
    const daily = completedDaily('2026-07-12T20:01:00.000Z')

    expect(rollFastFinishBonus('user-1', daily, storage, () => 0.99)).toBeUndefined()
    expect(rollFastFinishBonus('user-1', daily, storage, () => 0)).toBeUndefined()
  })

  it('awards and spends a lifeline without allowing reward rerolls', () => {
    const storage = new MemoryStorage()
    const daily = completedDaily('2026-07-12T20:01:00.000Z')
    rollFastFinishBonus('user-1', daily, storage, () => 0)

    const first = completeBonusChallenge('user-1', 'assignment-1', storage, () => 0)
    expect(first.record.status).toBe('won-lifeline')
    expect(first.state.lifelines).toBe(1)
    expect(completeBonusChallenge('user-1', 'assignment-1', storage, () => 0.99).record.status).toBe('won-lifeline')
    expect(loadBonusState('user-1', storage).lifelines).toBe(1)
    expect(spendLifeline('user-1', storage).lifelines).toBe(0)
  })

  it('can reveal the one-time joke outcome with no reward', () => {
    const storage = new MemoryStorage()
    const daily = completedDaily('2026-07-12T20:01:00.000Z')
    rollFastFinishBonus('user-1', daily, storage, () => 0)

    const result = completeBonusChallenge('user-1', 'assignment-1', storage, () => 0.99)
    expect(result.record.status).toBe('won-nothing')
    expect(result.state.lifelines).toBe(0)
  })
})
