import { describe, expect, it } from 'vitest'
import type { DailyView } from '../types'
import {
  BONUS_PENALTY,
  acceptBonusChallenge,
  completeBonusChallenge,
  declineBonusChallenge,
  loadBonusState,
  offerDailyBonus,
  taskForBonus,
  type BonusStorage,
} from './bonusChallenge'

class MemoryStorage implements BonusStorage {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  seed(key: string, value: unknown) { this.values.set(key, JSON.stringify(value)) }
}

const userId = 'user-1'
const dateKey = '2026-07-12'
const key = `all-risk-no-reward.bonus.v1:${encodeURIComponent(userId)}`

function completedDaily(completedAt = '2026-07-12T20:40:00.000Z'): DailyView {
  return {
    dateKey,
    status: 'completed',
    unreadNotificationCount: 0,
    assignment: {
      id: 'assignment-1',
      userId,
      dateKey,
      challengeId: 'challenge-1',
      status: 'completed',
      unlockAt: '2026-07-12T07:00:00.000Z',
      deadlineAt: '2026-07-13T06:59:59.999Z',
      createdAt: '2026-07-12T07:00:00.000Z',
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

describe('daily bonus challenge state machine', () => {
  it('runs the 50% offer roll only once per date and persists both outcomes', () => {
    const offeredStorage = new MemoryStorage()
    const now = new Date('2026-07-12T20:41:00.000Z')
    const offered = offerDailyBonus(userId, completedDaily(), offeredStorage, () => 0.4999, now)
    expect(offered).toMatchObject({ dateKey, assignmentId: 'assignment-1', status: 'offered' })
    expect(offerDailyBonus(userId, completedDaily(), offeredStorage, () => 0.99, now)).toEqual(offered)

    const missedStorage = new MemoryStorage()
    expect(offerDailyBonus(userId, completedDaily(), missedStorage, () => 0.5, now)).toBeUndefined()
    expect(offerDailyBonus(userId, completedDaily(), missedStorage, () => 0, now)).toBeUndefined()
    expect(loadBonusState(userId, missedStorage, now).records[dateKey].status).toBe('not-offered')
  })

  it('does not roll before a full daily completion', () => {
    const storage = new MemoryStorage()
    const daily = completedDaily()
    daily.completion!.verdict = 'partial'
    expect(offerDailyBonus(userId, daily, storage, () => 0)).toBeUndefined()
    expect(loadBonusState(userId, storage).records).toEqual({})
  })

  it('spins all five difficulties first, then picks a canonical challenge at that exact level', () => {
    const storage = new MemoryStorage()
    const now = new Date('2026-07-12T20:41:00.000Z')
    offerDailyBonus(userId, completedDaily(), storage, () => 0, now)
    const rolls = [0.999999, 0.25]
    const accepted = acceptBonusChallenge(userId, dateKey, storage, () => rolls.shift()!, now)

    expect(accepted.record.status).toBe('committed')
    expect(accepted.record.selectedDifficulty).toBe(5)
    expect(accepted.record.selectedChallenge?.difficulty).toBe(5)
    expect(accepted.record.challengeId).toBe(accepted.record.selectedChallenge?.id)
    expect(taskForBonus(accepted.record)).toEqual(accepted.record.selectedChallenge)
    expect(accepted.record.deadlineAt).toBe(completedDaily().assignment!.deadlineAt)
  })

  it('is idempotent after acceptance and never allows a second accepted bonus that day', () => {
    const storage = new MemoryStorage()
    const now = new Date('2026-07-12T20:41:00.000Z')
    offerDailyBonus(userId, completedDaily(), storage, () => 0, now)
    const first = acceptBonusChallenge(userId, dateKey, storage, () => 0, now)
    const second = acceptBonusChallenge(userId, dateKey, storage, () => 0.99, now)
    expect(second.record).toEqual(first.record)
    expect(() => declineBonusChallenge(userId, dateKey, storage, now)).toThrow(/cannot be declined/i)
  })

  it('persists a decline and cannot offer or accept again that day', () => {
    const storage = new MemoryStorage()
    const now = new Date('2026-07-12T20:41:00.000Z')
    offerDailyBonus(userId, completedDaily(), storage, () => 0, now)
    expect(declineBonusChallenge(userId, dateKey, storage, now).record.status).toBe('declined')
    expect(offerDailyBonus(userId, completedDaily(), storage, () => 0, now)?.status).toBe('declined')
    expect(() => acceptBonusChallenge(userId, dateKey, storage, () => 0, now)).toThrow(/no longer available/i)
  })

  it('marks an on-time committed bonus complete and does not duplicate completion', () => {
    const storage = new MemoryStorage()
    const acceptedAt = new Date('2026-07-12T20:41:00.000Z')
    const completedAt = new Date('2026-07-13T06:59:59.999Z')
    offerDailyBonus(userId, completedDaily(), storage, () => 0, acceptedAt)
    acceptBonusChallenge(userId, dateKey, storage, () => 0, acceptedAt)
    const first = completeBonusChallenge(userId, dateKey, storage, completedAt)
    expect(first.record).toMatchObject({ status: 'completed', completedAt: completedAt.toISOString() })
    expect(completeBonusChallenge(userId, dateKey, storage, completedAt).record).toEqual(first.record)
  })

  it('marks an overdue commitment penalty-required and exposes one safe bounded penalty', () => {
    const storage = new MemoryStorage()
    const acceptedAt = new Date('2026-07-12T20:41:00.000Z')
    offerDailyBonus(userId, completedDaily(), storage, () => 0, acceptedAt)
    acceptBonusChallenge(userId, dateKey, storage, () => 0, acceptedAt)

    const overdue = loadBonusState(userId, storage, new Date('2026-07-13T07:00:00.000Z'))
    expect(overdue.records[dateKey].status).toBe('penalty-required')
    expect(() => completeBonusChallenge(userId, dateKey, storage, new Date('2026-07-13T07:00:00.000Z'))).toThrow(/penalty/i)
    expect(BONUS_PENALTY.prompt).toMatch(/adult you already know/i)
    expect(BONUS_PENALTY.safetyNote).toMatch(/stranger|pressure|repeat/i)
  })

  it('expires an unaccepted offer without assigning a penalty', () => {
    const storage = new MemoryStorage()
    offerDailyBonus(userId, completedDaily(), storage, () => 0, new Date('2026-07-12T20:41:00.000Z'))
    const state = loadBonusState(userId, storage, new Date('2026-07-13T07:00:00.000Z'))
    expect(state.records[dateKey].status).toBe('expired')
  })

  it('migrates v1 and v2 balances/records, filters malformed records, and persists v3', () => {
    const storage = new MemoryStorage()
    storage.seed(key, {
      version: 2,
      progressTickets: 2.9,
      records: {
        [dateKey]: { dateKey, assignmentId: 'legacy-assignment', status: 'earned-ticket' },
        bad: { assignmentId: '', status: 'offered' },
      },
    })

    const state = loadBonusState(userId, storage, new Date('2026-07-12T12:00:00.000Z'))
    expect(state.version).toBe(3)
    expect(state.progressTickets).toBe(2)
    expect(state.records[dateKey]).toMatchObject({ status: 'completed', assignmentId: 'legacy-assignment' })
    expect(state.records.bad).toBeUndefined()
    expect(JSON.parse(storage.getItem(key)!).version).toBe(3)

    const v1 = new MemoryStorage()
    v1.seed(key, { version: 1, lifelines: 3.8 })
    expect(loadBonusState(userId, v1).progressTickets).toBe(3)
  })

  it('recovers safely from corrupt JSON and clamps invalid random values', () => {
    const storage = new MemoryStorage()
    storage.setItem(key, '{broken')
    expect(loadBonusState(userId, storage)).toEqual({ version: 3, progressTickets: 0, records: {} })

    offerDailyBonus(userId, completedDaily(), storage, () => Number.NaN, new Date('2026-07-12T20:41:00.000Z'))
    const accepted = acceptBonusChallenge(userId, dateKey, storage, () => Number.POSITIVE_INFINITY, new Date('2026-07-12T20:41:00.000Z'))
    expect(accepted.record.selectedDifficulty).toBe(1)
    expect(accepted.record.selectedChallenge?.difficulty).toBe(1)
  })
})
