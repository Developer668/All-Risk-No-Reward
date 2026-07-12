import { describe, expect, it } from 'vitest'
import { ChallengeEngine, createUserState } from './engine'

describe('ChallengeEngine daily assignments', () => {
  it('creates the same per-user assignment and local schedule when synced repeatedly', () => {
    const now = new Date(2026, 6, 12, 9, 0)
    const engine = new ChallengeEngine(createUserState({
      id: 'user-1',
      name: 'Alex',
      email: 'alex@example.com',
      now,
    }))

    const first = engine.sync(now)
    const second = engine.sync(new Date(2026, 6, 12, 9, 30))

    expect(first.assignment?.id).toBe(second.assignment?.id)
    expect(first.assignment?.challengeId).toBe(second.assignment?.challengeId)
    expect(new Date(first.assignment!.unlockAt).getHours()).toBeGreaterThanOrEqual(10)
    expect(new Date(first.assignment!.unlockAt).getHours()).toBeLessThan(18)
    expect(new Date(first.assignment!.deadlineAt).getHours()).toBe(22)
  })

  it('does not repeat a challenge on consecutive assigned days when another is eligible', () => {
    const engine = new ChallengeEngine(createUserState({
      id: 'user-repeat',
      name: 'Alex',
      email: 'alex@example.com',
      now: new Date(2026, 6, 12, 12),
    }))
    const first = engine.sync(new Date(2026, 6, 12, 12)).assignment!
    engine.submitCompletion({ assignmentId: first.id, score: 100, note: 'I did the full challenge.' }, new Date(2026, 6, 12, 20))
    const second = engine.sync(new Date(2026, 6, 13, 20)).assignment!

    expect(second.challengeId).not.toBe(first.challengeId)
  })

  it('turns partial progress into a proportional reward and a recovery that blocks tomorrow', () => {
    const engine = new ChallengeEngine(createUserState({
      id: 'user-partial',
      name: 'Alex',
      email: 'alex@example.com',
      now: new Date(2026, 6, 12, 20),
    }))
    const assignment = engine.sync(new Date(2026, 6, 12, 20)).assignment!
    const result = engine.submitCompletion({
      assignmentId: assignment.id,
      score: 50,
      note: 'I started it and asked one follow-up question.',
    }, new Date(2026, 6, 12, 20, 15))

    expect(result.completion.verdict).toBe('partial')
    expect(result.completion.pointsAwarded).toBe(60)
    expect(result.recovery?.severity).toBe(2)
    expect(engine.sync(new Date(2026, 6, 13, 12)).status).toBe('blocked')
  })

  it('uses the proof service threshold and fixed point awards consistently', () => {
    const engine = new ChallengeEngine(createUserState({
      id: 'user-threshold',
      name: 'Alex',
      email: 'alex@example.com',
      now: new Date(2026, 6, 12, 20),
    }))
    const assignment = engine.sync(new Date(2026, 6, 12, 20)).assignment!
    const result = engine.submitCompletion({
      assignmentId: assignment.id,
      score: 72,
      note: 'Enough observable detail to verify this.',
    }, new Date(2026, 6, 12, 20, 15))

    expect(result.completion.verdict).toBe('complete')
    expect(result.completion.pointsAwarded).toBe(120)
    expect(result.recovery).toBeUndefined()
  })

  it('closes an unfinished assignment after its local deadline and creates one recovery', () => {
    const engine = new ChallengeEngine(createUserState({
      id: 'user-missed',
      name: 'Alex',
      email: 'alex@example.com',
      now: new Date(2026, 6, 12, 20),
    }))
    engine.sync(new Date(2026, 6, 12, 20))
    const missed = engine.sync(new Date(2026, 6, 12, 22, 0, 1))
    engine.sync(new Date(2026, 6, 12, 23))

    expect(missed.status).toBe('missed')
    expect(missed.recovery).toBeDefined()
    expect(engine.getState().recoveries).toHaveLength(1)
  })

  it('escalates an open recovery once per day, caps it safely, then unlocks the flow when completed', () => {
    const engine = new ChallengeEngine(createUserState({
      id: 'user-recovery',
      name: 'Alex',
      email: 'alex@example.com',
      now: new Date(2026, 6, 12, 20),
    }))
    const assignment = engine.sync(new Date(2026, 6, 12, 20)).assignment!
    const partial = engine.submitCompletion({
      assignmentId: assignment.id,
      score: 70,
      note: 'I made meaningful progress but did not finish.',
    }, new Date(2026, 6, 12, 20, 30))
    const recoveryId = partial.recovery!.id

    expect(engine.sync(new Date(2026, 6, 13, 9)).recovery?.severity).toBe(2)
    expect(engine.sync(new Date(2026, 6, 13, 18)).recovery?.severity).toBe(2)
    expect(engine.sync(new Date(2026, 6, 20, 9)).recovery?.severity).toBe(3)
    expect(engine.sync(new Date(2026, 7, 20, 9)).recovery?.severity).toBe(3)

    const unblocked = engine.completeRecovery(recoveryId, 'Closed the loop.', new Date(2026, 7, 20, 12))
    expect(unblocked.status).not.toBe('blocked')
    expect(unblocked.assignment).toBeDefined()
  })

  it('tracks points, streak, history, and deduplicated inbox notifications', () => {
    const engine = new ChallengeEngine(createUserState({
      id: 'user-progress',
      name: 'Alex',
      email: 'alex@example.com',
      now: new Date(2026, 6, 12, 20),
    }))

    const dayOne = engine.sync(new Date(2026, 6, 12, 20)).assignment!
    engine.submitCompletion({ assignmentId: dayOne.id, score: 100, note: 'Finished day one.' }, new Date(2026, 6, 12, 20, 5))
    const dayTwo = engine.sync(new Date(2026, 6, 13, 20)).assignment!
    engine.sync(new Date(2026, 6, 13, 20))
    engine.submitCompletion({ assignmentId: dayTwo.id, score: 100, note: 'Finished day two.' }, new Date(2026, 6, 13, 20, 5))

    const state = engine.getState()
    expect(state.profile.couragePoints).toBe(240)
    expect(state.profile.streak).toBe(2)
    expect(engine.getHistory(new Date(2026, 6, 13, 20, 10))).toHaveLength(2)
    expect(new Set(state.notifications.map((item) => item.id)).size).toBe(state.notifications.length)
    expect(state.notifications.some((item) => item.kind === 'unlocked')).toBe(true)
  })

  it('resets a streak when a calendar day passes without a completion', () => {
    const engine = new ChallengeEngine(createUserState({
      id: 'user-gap',
      name: 'Alex',
      email: 'alex@example.com',
      now: new Date(2026, 6, 12, 20),
    }))
    const first = engine.sync(new Date(2026, 6, 12, 20)).assignment!
    engine.submitCompletion({ assignmentId: first.id, score: 100, note: 'Completed.' }, new Date(2026, 6, 12, 20, 5))

    engine.sync(new Date(2026, 6, 14, 12))
    expect(engine.getState().profile.streak).toBe(0)
  })

  it('persists boundaries and replaces a reported open challenge', () => {
    const engine = new ChallengeEngine(createUserState({
      id: 'user-safety',
      name: 'Alex',
      email: 'alex@example.com',
      now: new Date(2026, 6, 12, 12),
    }))
    const original = engine.sync(new Date(2026, 6, 12, 12)).assignment!
    engine.updateSettings({
      boundaries: ['No direct messages'],
      disabledBoundaryTags: ['direct-message'],
    }, new Date(2026, 6, 12, 12))
    const replaced = engine.reportChallenge({
      assignmentId: original.id,
      challengeId: original.challengeId,
      reason: 'crosses-boundary',
      details: 'Not a fit today.',
    }, new Date(2026, 6, 12, 12, 5))

    expect(replaced.assignment?.id).not.toBe(original.id)
    expect(replaced.assignment?.challengeId).not.toBe(original.challengeId)
    expect(engine.getState().profile.boundaries).toEqual(['No direct messages'])
    expect(engine.getState().reports).toHaveLength(1)
  })
})
