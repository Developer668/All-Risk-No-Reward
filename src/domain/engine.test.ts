import { describe, expect, it } from 'vitest'
import { ChallengeEngine, createUserState } from './engine'
import type { ResetTask } from '../types'

const diceCatalog: ResetTask[] = [
  { id: 'easy', title: 'Easy', prompt: 'Easy task', difficulty: 1, minutes: 1, privateOnly: true },
  { id: 'medium', title: 'Medium', prompt: 'Medium task', difficulty: 2, minutes: 2, privateOnly: true },
  { id: 'hard', title: 'Hard', prompt: 'Hard task', difficulty: 5, minutes: 3, privateOnly: true },
]

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

  it('turns partial progress into an immediate proportional recovery lock', () => {
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
    expect(result.view.status).toBe('blocked')
    expect(result.view.recovery?.id).toBe(result.recovery?.id)
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

    expect(missed.status).toBe('blocked')
    expect(missed.assignment?.status).toBe('missed')
    expect(missed.recovery?.severity).toBe(3)
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

    expect(partial.recovery?.severity).toBe(1)
    expect(engine.sync(new Date(2026, 6, 13, 9)).recovery?.severity).toBe(2)
    expect(engine.sync(new Date(2026, 6, 13, 18)).recovery?.severity).toBe(2)
    expect(engine.sync(new Date(2026, 6, 20, 9)).recovery?.severity).toBe(3)
    expect(engine.sync(new Date(2026, 7, 20, 9)).recovery?.severity).toBe(3)

    const unblocked = engine.completeRecovery(recoveryId, 'Closed the loop.', new Date(2026, 7, 20, 12))
    expect(unblocked.status).not.toBe('blocked')
    expect(unblocked.assignment).toBeDefined()
  })

  it('lets a user gamble twice across the entire unseen punishment catalog, then locks the result', () => {
    const now = new Date(2026, 6, 12, 20)
    const engine = new ChallengeEngine(createUserState({
      id: 'user-dice',
      name: 'Alex',
      email: 'alex@example.com',
      now,
    }), undefined, diceCatalog, () => 0)
    const assignment = engine.sync(now).assignment!
    const partial = engine.submitCompletion({
      assignmentId: assignment.id,
      score: 50,
      note: 'I made a meaningful partial attempt.',
    }, new Date(2026, 6, 12, 20, 5))

    expect(partial.recovery?.taskId).toBe('medium')
    const firstRoll = engine.rerollRecovery(partial.recovery!.id, new Date(2026, 6, 12, 20, 6))
    expect(firstRoll.recoveryTask?.id).toBe('easy')
    expect(firstRoll.recovery?.rerollCount).toBe(1)
    expect(firstRoll.recoveryRerollsRemaining).toBe(1)

    // Reconstructing the engine models a reload/sign-in and proves that both
    // the spent roll and every prior result remain excluded.
    const restored = new ChallengeEngine(engine.getState(), undefined, diceCatalog, () => 0)
    const secondRoll = restored.rerollRecovery(partial.recovery!.id, new Date(2026, 6, 12, 20, 7))
    expect(secondRoll.recoveryTask?.id).toBe('hard')
    expect(secondRoll.recovery?.severity).toBe(5)
    expect(secondRoll.recovery?.rerollCount).toBe(2)
    expect(secondRoll.recoveryRerollStatus).toBe('limit-reached')
    expect(restored.getState().assignedRecoveryTaskIds).toEqual(['medium', 'easy', 'hard'])
    expect(() => restored.rerollRecovery(partial.recovery!.id, new Date(2026, 6, 12, 20, 8)))
      .toThrowError(expect.objectContaining({ code: 'REROLL_LIMIT_REACHED' }))
  })

  it('keeps the current punishment and disables dice when no unseen catalog item remains', () => {
    const now = new Date(2026, 6, 12, 20)
    const oneTaskCatalog = [diceCatalog[1]]
    const engine = new ChallengeEngine(createUserState({
      id: 'user-dice-exhausted',
      name: 'Alex',
      email: 'alex@example.com',
      now,
    }), undefined, oneTaskCatalog, () => 0)
    const assignment = engine.sync(now).assignment!
    const partial = engine.submitCompletion({
      assignmentId: assignment.id,
      score: 50,
      note: 'I made a meaningful partial attempt.',
    }, new Date(2026, 6, 12, 20, 5))

    expect(partial.view.recoveryRerollStatus).toBe('catalog-exhausted')
    expect(() => engine.rerollRecovery(partial.recovery!.id, new Date(2026, 6, 12, 20, 6)))
      .toThrowError(expect.objectContaining({ code: 'RECOVERY_CATALOG_EXHAUSTED' }))
    expect(engine.getState().recoveries[0]).toMatchObject({ taskId: 'medium', rerollCount: 0 })
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
