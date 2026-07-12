import type { DailyView } from '../types'

const STORAGE_PREFIX = 'all-risk-no-reward.bonus.v1'

export type BonusStatus = 'offered' | 'earned-ticket' | 'declined'

export interface BonusTask {
  id: string
  title: string
  prompt: string
}

export interface BonusRecord {
  dateKey: string
  assignmentId: string
  taskId?: string
  status: BonusStatus
}

export interface BonusState {
  version: 2
  progressTickets: number
  records: Record<string, BonusRecord>
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
  return { version: 2, progressTickets: 0, records: {} }
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${encodeURIComponent(userId)}`
}

export function loadBonusState(userId: string, storage: BonusStorage): BonusState {
  try {
    const parsed = JSON.parse(storage.getItem(storageKey(userId)) ?? 'null') as {
      version?: number
      lifelines?: number
      progressTickets?: number
      records?: Record<string, BonusRecord>
    } | null
    if (!parsed) return emptyState()
    if (parsed.version === 1) {
      return { version: 2, progressTickets: Math.max(0, Math.floor(Number(parsed.lifelines) || 0)), records: {} }
    }
    if (parsed.version !== 2 || typeof parsed.records !== 'object' || !parsed.records) return emptyState()
    return {
      version: 2,
      progressTickets: Math.max(0, Math.floor(Number(parsed.progressTickets) || 0)),
      records: parsed.records as Record<string, BonusRecord>,
    }
  } catch {
    return emptyState()
  }
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

export function offerDailyBonus(
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
  const existing = state.records[daily.dateKey]
  if (existing) return existing

  const record: BonusRecord = {
    dateKey: daily.dateKey,
    assignmentId: assignment.id,
    taskId: bonusTasks[Math.min(bonusTasks.length - 1, Math.floor(random() * bonusTasks.length))].id,
    status: 'offered',
  }

  state.records[daily.dateKey] = record
  saveBonusState(userId, storage, state)
  return record
}

export function completeBonusChallenge(
  userId: string,
  dateKey: string,
  storage: BonusStorage,
): { state: BonusState; record: BonusRecord } {
  const state = loadBonusState(userId, storage)
  const record = state.records[dateKey]
  if (!record) throw new Error('That bonus challenge is not available.')
  if (record.status !== 'offered') return { state, record }

  record.status = 'earned-ticket'
  state.progressTickets += 1
  state.records[dateKey] = record
  return { state: saveBonusState(userId, storage, state), record }
}

export function declineBonusChallenge(userId: string, dateKey: string, storage: BonusStorage): { state: BonusState; record: BonusRecord } {
  const state = loadBonusState(userId, storage)
  const record = state.records[dateKey]
  if (!record) throw new Error('That bonus challenge is not available.')
  if (record.status === 'offered') record.status = 'declined'
  state.records[dateKey] = record
  return { state: saveBonusState(userId, storage, state), record }
}

export function spendProgressTicket(userId: string, storage: BonusStorage): BonusState {
  const state = loadBonusState(userId, storage)
  if (state.progressTickets < 1) throw new Error('You do not have a progress ticket to spend.')
  state.progressTickets -= 1
  return saveBonusState(userId, storage, state)
}

export function taskForBonus(record?: BonusRecord): BonusTask | undefined {
  return bonusTasks.find((task) => task.id === record?.taskId)
}
