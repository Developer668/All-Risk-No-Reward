import { describe, expect, it } from 'vitest'
import type { DailyView } from '../types'
import {
  completeBonusChallenge,
  declineBonusChallenge,
  loadBonusState,
  offerDailyBonus,
  spendProgressTicket,
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

describe('daily progress-ticket bonus', () => {
  it('always offers one persisted optional bonus after a full daily completion', () => {
    const storage = new MemoryStorage()
    const daily = completedDaily('2026-07-12T20:40:00.000Z')
    const offered = offerDailyBonus('user-1', daily, storage, () => 0)

    expect(offered).toMatchObject({ dateKey: '2026-07-12', assignmentId: 'assignment-1', status: 'offered' })
    expect(offerDailyBonus('user-1', daily, storage, () => 0.99)).toEqual(offered)
  })

  it('persists a decline so the same day cannot ask again', () => {
    const storage = new MemoryStorage()
    const daily = completedDaily('2026-07-12T20:01:00.000Z')
    offerDailyBonus('user-1', daily, storage, () => 0)

    expect(declineBonusChallenge('user-1', daily.dateKey, storage).record.status).toBe('declined')
    expect(offerDailyBonus('user-1', daily, storage, () => 0.99)?.status).toBe('declined')
  })

  it('always awards one single-use progress ticket without duplicate rewards', () => {
    const storage = new MemoryStorage()
    const daily = completedDaily('2026-07-12T20:01:00.000Z')
    offerDailyBonus('user-1', daily, storage, () => 0)

    const first = completeBonusChallenge('user-1', daily.dateKey, storage)
    expect(first.record.status).toBe('earned-ticket')
    expect(first.state.progressTickets).toBe(1)
    expect(completeBonusChallenge('user-1', daily.dateKey, storage).record.status).toBe('earned-ticket')
    expect(loadBonusState('user-1', storage).progressTickets).toBe(1)
    expect(spendProgressTicket('user-1', storage).progressTickets).toBe(0)
  })
})
