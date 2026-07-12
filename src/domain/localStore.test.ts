import { describe, expect, it } from 'vitest'
import { LocalStore, MemoryStorage } from '../services/localStore'

describe('LocalStore authentication and persistence', () => {
  it('restores a persisted session without storing the plaintext password', async () => {
    const storage = new MemoryStorage()
    const now = new Date(2026, 6, 12, 12)
    const first = new LocalStore({ storage, now: () => now })
    const signedUp = await first.signUp('Alex', 'alex@example.com', 'correct horse')
    const second = new LocalStore({ storage, now: () => now })

    expect(second.restoreSession()?.profile.id).toBe(signedUp.profile.id)
    expect(storage.dump()).not.toContain('correct horse')
  })

  it('supports device-local password reset and invalidates the old credential', async () => {
    const storage = new MemoryStorage()
    const store = new LocalStore({ storage, now: () => new Date(2026, 6, 12, 12) })
    await store.signUp('Alex', 'alex@example.com', 'old password')
    await store.resetPassword('alex@example.com', 'new password')

    await expect(store.signIn('alex@example.com', 'old password')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    })
    await expect(store.signIn('alex@example.com', 'new password')).resolves.toMatchObject({
      profile: { email: 'alex@example.com' },
    })
  })

  it('creates one reusable demo account and can export then delete all of its data', async () => {
    const storage = new MemoryStorage()
    const store = new LocalStore({ storage, now: () => new Date(2026, 6, 12, 12) })
    const first = await store.ensureDemoSession()
    const second = await store.ensureDemoSession()

    expect(second.profile.id).toBe(first.profile.id)
    expect(store.exportData()).toMatchObject({
      account: { email: 'demo@allrisk.local', name: 'Alex' },
      state: { profile: { id: first.profile.id } },
    })
    expect(JSON.stringify(store.exportData())).not.toContain('passwordHash')

    store.deleteMyData()
    expect(store.restoreSession()).toBeNull()
    expect(storage.dump()).not.toContain('demo@allrisk.local')
  })

  it('persists challenge progress, settings, history, and inbox state across instances', async () => {
    const storage = new MemoryStorage()
    let now = new Date(2026, 6, 12, 20)
    const first = new LocalStore({ storage, now: () => now })
    await first.signUp('Alex', 'alex@example.com', 'correct horse')
    first.updateSettings({ boundaries: ['No invitations'], disabledBoundaryTags: ['invitation'] })
    const assignment = first.getDashboard().assignment!
    first.submitCompletion({
      assignmentId: assignment.id,
      score: 90,
      note: 'Completed the observable action.',
    })
    first.markAllNotificationsRead()

    now = new Date(2026, 6, 12, 20, 30)
    const restored = new LocalStore({ storage, now: () => now })
    expect(restored.restoreSession()).not.toBeNull()
    expect(restored.getDashboard().status).toBe('completed')
    expect(restored.getHistory()).toHaveLength(1)
    expect(restored.getSettings().boundaries).toEqual(['No invitations'])
    expect(restored.getNotifications().every((item) => item.readAt)).toBe(true)
  })

  it('expires a local session after thirty days while retaining the account data', async () => {
    const storage = new MemoryStorage()
    let now = new Date(2026, 6, 12, 12)
    const store = new LocalStore({ storage, now: () => now })
    await store.signUp('Alex', 'alex@example.com', 'correct horse')
    now = new Date(2026, 7, 12, 12, 0, 1)

    expect(store.restoreSession()).toBeNull()
    await expect(store.signIn('alex@example.com', 'correct horse')).resolves.toMatchObject({
      profile: { email: 'alex@example.com' },
    })
  })
})
