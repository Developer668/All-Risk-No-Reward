import type { DailyView } from '../types'

const STORAGE_PREFIX = 'all-risk-no-reward.bonus.v1'
const OFFER_CHANCE = 0.45
const LIFELINE_CHANCE = 0.5

export type BonusStatus = 'not-offered' | 'offered' | 'won-lifeline' | 'won-nothing'

export interface BonusTask {
  id: string
  title: string
  prompt: string
}

export interface BonusRecord {
  assignmentId: string
  taskId?: string
  status: BonusStatus
}

export interface BonusState {
  version: 1
  lifelines: number
  records: Record<string, BonusRecord>
  startedAtByAssignment: Record<string, string>
}

export interface BonusStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const bonusTasks: BonusTask[] = [
  {
    id: 'tiny-hello',
    title: 'The tiny hello',
    prompt: 'Say a clear hello to one person you would normally pass without speaking.',
  },
  {
    id: 'honest-detail',
    title: 'Add one honest detail',
    prompt: 'In your next conversation, answer one question with a real detail instead of “good” or “fine.”',
  },
  {
    id: 'quick-thanks',
    title: 'Make the thanks specific',
    prompt: 'Thank someone for one precise thing they did, even if it was small.',
  },
  {
    id: 'first-question',
    title: 'Ask first',
    prompt: 'Start one low-stakes interaction by asking a genuine question before someone asks you one.',
  },
]

function emptyState(): BonusState {
  return { version: 1, lifelines: 0, records: {}, startedAtByAssignment: {} }
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${encodeURIComponent(userId)}`
}

export function loadBonusState(userId: string, storage: BonusStorage): BonusState {
  try {
    const parsed = JSON.parse(storage.getItem(storageKey(userId)) ?? 'null') as Partial<BonusState> | null
    if (!parsed || parsed.version !== 1 || typeof parsed.records !== 'object' || !parsed.records) return emptyState()
    return {
      version: 1,
      lifelines: Math.max(0, Math.floor(Number(parsed.lifelines) || 0)),
      records: parsed.records as Record<string, BonusRecord>,
      startedAtByAssignment: typeof parsed.startedAtByAssignment === 'object' && parsed.startedAtByAssignment
        ? parsed.startedAtByAssignment as Record<string, string>
        : {},
    }
  } catch {
    return emptyState()
  }
}

export function markChallengeStarted(
  userId: string,
  assignmentId: string,
  storage: BonusStorage,
  now = new Date(),
): BonusState {
  const state = loadBonusState(userId, storage)
  state.startedAtByAssignment[assignmentId] ??= now.toISOString()
  return saveBonusState(userId, storage, state)
}

export function clearBonusState(
  userId: string,
  storage: BonusStorage & { removeItem(key: string): void },
): void {
  storage.removeItem(storageKey(userId))
}

function saveBonusState(userId: string, storage: BonusStorage, state: BonusState): BonusState {
  storage.setItem(storageKey(userId), JSON.stringify(state))
  return state
}

export function rollFastFinishBonus(
  userId: string,
  daily: DailyView,
  storage: BonusStorage,
  random: () => number = Math.random,
): BonusRecord | undefined {
  const assignment = daily.assignment
  const challenge = daily.challenge
  const completion = daily.completion
  if (!assignment || !challenge || !completion || completion.verdict !== 'complete') return undefined

  const state = loadBonusState(userId, storage)
  const existing = state.records[assignment.id]
  if (existing) return existing.status === 'not-offered' ? undefined : existing

  const startedAt = state.startedAtByAssignment[assignment.id] ?? assignment.unlockAt
  const elapsed = new Date(completion.completedAt).getTime() - new Date(startedAt).getTime()
  const fastWindow = challenge.minutes * 60_000
  const isFastFinish = Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= fastWindow
  const offered = isFastFinish && random() < OFFER_CHANCE
  const record: BonusRecord = offered
    ? {
        assignmentId: assignment.id,
        taskId: bonusTasks[Math.min(bonusTasks.length - 1, Math.floor(random() * bonusTasks.length))].id,
        status: 'offered',
      }
    : { assignmentId: assignment.id, status: 'not-offered' }

  state.records[assignment.id] = record
  saveBonusState(userId, storage, state)
  return offered ? record : undefined
}

export function completeBonusChallenge(
  userId: string,
  assignmentId: string,
  storage: BonusStorage,
  random: () => number = Math.random,
): { state: BonusState; record: BonusRecord } {
  const state = loadBonusState(userId, storage)
  const record = state.records[assignmentId]
  if (!record || record.status === 'not-offered') throw new Error('That bonus challenge is not available.')
  if (record.status !== 'offered') return { state, record }

  record.status = random() < LIFELINE_CHANCE ? 'won-lifeline' : 'won-nothing'
  if (record.status === 'won-lifeline') state.lifelines += 1
  state.records[assignmentId] = record
  return { state: saveBonusState(userId, storage, state), record }
}

export function spendLifeline(userId: string, storage: BonusStorage): BonusState {
  const state = loadBonusState(userId, storage)
  if (state.lifelines < 1) throw new Error('You do not have a lifeline to spend.')
  state.lifelines -= 1
  return saveBonusState(userId, storage, state)
}

export function taskForBonus(record?: BonusRecord): BonusTask | undefined {
  return bonusTasks.find((task) => task.id === record?.taskId)
}
