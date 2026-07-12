import { describe, expect, it } from 'vitest'
import { ChallengeEngine, createUserState } from './engine'
import type { ResetTask } from '../types'

const diceCatalog: ResetTask[] = [
  { id: 'easy', title: 'Easy', prompt: 'Easy task', difficulty: 1, minutes: 1, privateOnly: true },
  { id: 'medium', title: 'Medium', prompt: 'Medium task', difficulty: 2, minutes: 2, privateOnly: true },
  { id: 'hard', title: 'Hard', prompt: 'Hard task', difficulty: 5, minutes: 3, privateOnly: true },
]

describe('ChallengeEngine daily assignments', () => {
  it('lets the local developer lab force a difficulty and exercise assignment states', () => {
    const now = new Date(2026, 6, 12, 14, 0)
    const engine = new ChallengeEngine(createUserState({
      id: 'developer-lab',
      name: 'Alex',
      email: 'alex@example.com',
      now,
    }), undefined, undefined, () => 0)

    const generated = engine.developerRegenerateChallenge({ difficulty: 5 }, now)
    expect(generated.challenge?.difficulty).toBe(5)
    expect(generated.status).toBe('available')
    expect(engine.developerApplyScenario('lock', now).status).toBe('locked')
    expect(engine.developerApplyScenario('unlock', now).status).toBe('available')
    expect(engine.developerApplyScenario('complete', now).status).toBe('completed')
    expect(engine.getState().profile.couragePoints).toBe(120)

    const reset = engine.developerResetToday(now)
    expect(reset.assignment).toBeDefined()
    expect(engine.getState().profile.couragePoints).toBe(0)
  })

  it('lets the developer lab simulate a partial or missed challenge and close recovery', () => {
    const now = new Date(2026, 6, 12, 14, 0)
    const engine = new ChallengeEngine(createUserState({
      id: 'developer-recovery',
      name: 'Alex',
      email: 'alex@example.com',
      now,
    }))

    engine.developerRegenerateChallenge({ difficulty: 2 }, now)
    const partial = engine.developerApplyScenario('partial', now)
    expect(partial.status).toBe('blocked')
    expect(partial.recovery).toBeDefined()
    expect(engine.developerApplyScenario('recovery-complete', now).status).toBe('partial')

    engine.developerRegenerateChallenge({ difficulty: 3 }, now)
    const missed = engine.developerApplyScenario('missed', now)
    expect(missed.status).toBe('blocked')
    expect(missed.assignment?.status).toBe('missed')
  })

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

  it('replaces an open assignment whose challenge was retired from the catalog', () => {
    const now = new Date(2026, 6, 12, 20)
    const state = createUserState({
      id: 'user-catalog-upgrade',
      name: 'Alex',
      email: 'alex@example.com',
      now,
    })
    state.assignments.push({
      id: 'assignment:legacy',
      userId: state.profile.id,
      dateKey: '2026-07-12',
      challengeId: 'retired-legacy-challenge',
      status: 'available',
      unlockAt: new Date(2026, 6, 12, 10).toISOString(),
      deadlineAt: new Date(2026, 6, 12, 22).toISOString(),
      createdAt: now.toISOString(),
    })

    const engine = new ChallengeEngine(state)
    const view = engine.sync(now)

    expect(view.assignment?.challengeId).not.toBe('retired-legacy-challenge')
    expect(view.assignment?.replacementForAssignmentId).toBe('assignment:legacy')
    expect(engine.getState().assignments.find(({ id }) => id === 'assignment:legacy')?.status).toBe('reported')
    expect(view.recovery).toBeUndefined()
  })

  it('does not punish an expired open assignment retired by a catalog upgrade', () => {
    const state = createUserState({
      id: 'user-expired-catalog-upgrade',
      name: 'Alex',
      email: 'alex@example.com',
      now: new Date(2026, 6, 11, 20),
    })
    state.assignments.push({
      id: 'assignment:expired-legacy',
      userId: state.profile.id,
      dateKey: '2026-07-11',
      challengeId: 'retired-expired-challenge',
      status: 'available',
      unlockAt: new Date(2026, 6, 11, 10).toISOString(),
      deadlineAt: new Date(2026, 6, 11, 22).toISOString(),
      createdAt: new Date(2026, 6, 11, 20).toISOString(),
    })

    const engine = new ChallengeEngine(state)
    const view = engine.sync(new Date(2026, 6, 12, 9))

    expect(engine.getState().assignments.find(({ id }) => id === 'assignment:expired-legacy')?.status).toBe('reported')
    expect(view.recovery).toBeUndefined()
    expect(view.assignment?.challengeId).not.toBe('retired-expired-challenge')
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

  it('uses a progress ticket to preserve streak continuity and close recovery', () => {
    const now = new Date(2026, 6, 12, 20)
    const state = createUserState({ id: 'ticket-user', name: 'Alex', email: 'alex@example.com', now })
    state.profile.streak = 2
    state.assignments.push(
      { id: 'prior-1', userId: state.profile.id, dateKey: '2026-07-10', challengeId: 'easy-comedy-001', status: 'completed', unlockAt: new Date(2026, 6, 10, 10).toISOString(), deadlineAt: new Date(2026, 6, 10, 22).toISOString(), createdAt: new Date(2026, 6, 10, 10).toISOString() },
      { id: 'prior-2', userId: state.profile.id, dateKey: '2026-07-11', challengeId: 'easy-comedy-002', status: 'completed', unlockAt: new Date(2026, 6, 11, 10).toISOString(), deadlineAt: new Date(2026, 6, 11, 22).toISOString(), createdAt: new Date(2026, 6, 11, 10).toISOString() },
    )
    const engine = new ChallengeEngine(state)
    const assignment = engine.sync(now).assignment!
    const partial = engine.submitCompletion({ assignmentId: assignment.id, score: 50, note: 'I made a visible partial attempt.' }, new Date(2026, 6, 12, 20, 5))

    expect(partial.view.status).toBe('blocked')
    const protectedView = engine.redeemProgressTicket(assignment.id, new Date(2026, 6, 12, 20, 6))
    expect(protectedView.status).toBe('partial')
    expect(protectedView.assignment?.progressProtected).toBe(true)
    expect(protectedView.recovery).toBeUndefined()
    expect(engine.getState().profile.streak).toBe(3)
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

  it('accepts video proof without requiring an optional text note', () => {
    const now = new Date(2026, 6, 12, 20)
    const engine = new ChallengeEngine(createUserState({
      id: 'user-video-only',
      name: 'Alex',
      email: 'alex@example.com',
      now,
    }))
    const assignment = engine.sync(now).assignment!
    const result = engine.submitCompletion({
      assignmentId: assignment.id,
      score: 100,
      note: '',
      proofName: 'challenge-proof.mp4',
    }, new Date(2026, 6, 12, 20, 15))

    expect(result.completion.verdict).toBe('complete')
    expect(result.completion.proofName).toBe('challenge-proof.mp4')
  })

  it('keeps a low-evidence proof retryable instead of creating a punishment', () => {
    const now = new Date(2026, 6, 12, 20)
    const engine = new ChallengeEngine(createUserState({
      id: 'user-needs-more',
      name: 'Alex',
      email: 'alex@example.com',
      now,
    }))
    const assignment = engine.sync(now).assignment!
    const result = engine.submitCompletion({
      assignmentId: assignment.id,
      score: 24,
      note: 'I need to add more detail.',
    }, new Date(2026, 6, 12, 20, 5))

    expect(result.completion.verdict).toBe('needs-more')
    expect(result.view.status).toBe('available')
    expect(result.recovery).toBeUndefined()
    expect(engine.getState().recoveries).toHaveLength(0)
    expect(engine.getState().assignments[0].status).toBe('available')
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

  it('supports operator-ranked recovery escalation through level five', () => {
    const now = new Date(2026, 6, 12, 20)
    const rankedCatalog: ResetTask[] = [1, 2, 3, 4, 5].map((difficulty) => ({
      id: `ranked-${difficulty}`,
      title: `Ranked ${difficulty}`,
      prompt: `Level ${difficulty} task`,
      difficulty: difficulty as ResetTask['difficulty'],
      minutes: 5,
      privateOnly: true,
    }))
    const engine = new ChallengeEngine(createUserState({
      id: 'user-five-levels',
      name: 'Alex',
      email: 'alex@example.com',
      now,
    }), undefined, rankedCatalog)
    const assignment = engine.sync(now).assignment!
    engine.submitCompletion({
      assignmentId: assignment.id,
      score: 70,
      note: 'I made strong partial progress.',
    }, new Date(2026, 6, 12, 20, 5))

    expect(engine.sync(new Date(2026, 6, 13, 20)).recovery?.severity).toBe(2)
    expect(engine.sync(new Date(2026, 6, 14, 20)).recovery?.severity).toBe(3)
    expect(engine.sync(new Date(2026, 6, 15, 20)).recovery?.severity).toBe(4)
    expect(engine.sync(new Date(2026, 6, 16, 20)).recovery?.severity).toBe(5)
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
