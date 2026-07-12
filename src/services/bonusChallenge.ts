import { challenges } from '../data/challenges'
import type { Challenge, DailyView, Difficulty } from '../types'

const STORAGE_PREFIX = 'all-risk-no-reward.bonus.v1'
const CURRENT_VERSION = 3 as const
const OFFER_CHANCE = 0.5
const difficultyLevels: Difficulty[] = [1, 2, 3, 4, 5]

export type BonusStatus =
  | 'not-offered'
  | 'offered'
  | 'declined'
  | 'expired'
  | 'committed'
  | 'completed'
  | 'penalty-required'

export type BonusTask = Challenge

export interface BonusPenaltyTask {
  id: string
  title: string
  prompt: string
  safetyNote: string
}

/**
 * A single bounded consequence for an accepted bonus that misses its deadline.
 * The wording deliberately excludes strangers, repeated contact, sexual content,
 * pressure, and gender-specific targeting.
 */
export const BONUS_PENALTY: BonusPenaltyTask = {
  id: 'respectful-known-adult-invitation',
  title: 'Make one respectful invitation',
  prompt: 'Invite one adult you already know to a low-pressure activity. Make it easy for them to decline, and accept their answer without following up again.',
  safetyNote: 'Do not contact a stranger, send sexual content, pressure anyone, or repeat the invitation after a no or no response.',
}

export interface BonusRecord {
  dateKey: string
  assignmentId: string
  status: BonusStatus
  offeredAt: string
  deadlineAt: string
  acceptedAt?: string
  completedAt?: string
  selectedDifficulty?: Difficulty
  challengeId?: string
  /** A snapshot keeps the committed task stable if the catalog changes later. */
  selectedChallenge?: Challenge
}

export interface BonusState {
  version: 3
  /** Retained so users do not lose tickets earned under the v1/v2 bonus system. */
  progressTickets: number
  records: Record<string, BonusRecord>
}

export interface BonusStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Compatibility export for callers that previously rendered the small bonus list. */
export const bonusTasks: BonusTask[] = challenges

function emptyState(): BonusState {
  return { version: CURRENT_VERSION, progressTickets: 0, records: {} }
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${encodeURIComponent(userId)}`
}

function safeInteger(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0
}

function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function endOfLocalDate(dateKey: string): string {
  return new Date(`${dateKey}T23:59:59.999`).toISOString()
}

function isDifficulty(value: unknown): value is Difficulty {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5
}

function challengeSnapshot(value: unknown): Challenge | undefined {
  if (!value || typeof value !== 'object') return undefined
  const candidate = value as Partial<Challenge>
  if (
    typeof candidate.id !== 'string'
    || typeof candidate.title !== 'string'
    || typeof candidate.prompt !== 'string'
    || !isDifficulty(candidate.difficulty)
  ) return undefined
  return value as Challenge
}

function normalizeStatus(value: unknown): BonusStatus | undefined {
  switch (value) {
    case 'not-offered':
    case 'offered':
    case 'declined':
    case 'expired':
    case 'committed':
    case 'completed':
    case 'penalty-required':
      return value
    case 'earned-ticket':
      return 'completed'
    default:
      return undefined
  }
}

function normalizeRecord(dateKey: string, value: unknown): BonusRecord | undefined {
  if (!isDateKey(dateKey) || !value || typeof value !== 'object') return undefined
  const candidate = value as Partial<BonusRecord> & { taskId?: unknown }
  const storedStatus = (value as { status?: unknown }).status
  if (typeof candidate.assignmentId !== 'string' || !candidate.assignmentId) return undefined
  const status = normalizeStatus(storedStatus)
  if (!status) return undefined

  const deadlineAt = validDate(candidate.deadlineAt) ? candidate.deadlineAt : endOfLocalDate(dateKey)
  const offeredAt = validDate(candidate.offeredAt) ? candidate.offeredAt : new Date(`${dateKey}T00:00:00`).toISOString()
  const selected = challengeSnapshot(candidate.selectedChallenge)
    ?? (typeof candidate.challengeId === 'string' ? challenges.find(({ id }) => id === candidate.challengeId) : undefined)
  const selectedDifficulty = isDifficulty(candidate.selectedDifficulty)
    ? candidate.selectedDifficulty
    : selected?.difficulty

  // A committed/completed record must contain the exact challenge it committed to.
  // Malformed legacy committed records are made penalty-required instead of silently
  // assigning a new random challenge during migration.
  const isLegacyTicket = storedStatus === 'earned-ticket'
  const normalizedStatus = !isLegacyTicket && (status === 'committed' || status === 'completed') && (!selected || !selectedDifficulty)
    ? 'penalty-required'
    : status

  return {
    dateKey,
    assignmentId: candidate.assignmentId,
    status: normalizedStatus,
    offeredAt,
    deadlineAt,
    ...(validDate(candidate.acceptedAt) ? { acceptedAt: candidate.acceptedAt } : {}),
    ...(validDate(candidate.completedAt) ? { completedAt: candidate.completedAt } : {}),
    ...(selectedDifficulty ? { selectedDifficulty } : {}),
    ...(selected ? { challengeId: selected.id, selectedChallenge: selected } : {}),
  }
}

function applyDeadlines(state: BonusState, now: Date): boolean {
  let changed = false
  const timestamp = now.getTime()
  if (!Number.isFinite(timestamp)) return false

  for (const record of Object.values(state.records)) {
    if (timestamp <= Date.parse(record.deadlineAt)) continue
    if (record.status === 'committed') {
      record.status = 'penalty-required'
      changed = true
    } else if (record.status === 'offered') {
      record.status = 'expired'
      changed = true
    }
  }
  return changed
}

export function loadBonusState(userId: string, storage: BonusStorage, now = new Date()): BonusState {
  try {
    const raw = storage.getItem(storageKey(userId))
    const parsed = JSON.parse(raw ?? 'null') as {
      version?: unknown
      lifelines?: unknown
      progressTickets?: unknown
      records?: unknown
    } | null
    if (!parsed || typeof parsed !== 'object') return emptyState()

    const rawRecords = parsed.records && typeof parsed.records === 'object'
      ? parsed.records as Record<string, unknown>
      : {}
    const records: Record<string, BonusRecord> = {}
    for (const [dateKey, candidate] of Object.entries(rawRecords)) {
      const record = normalizeRecord(dateKey, candidate)
      if (record) records[dateKey] = record
    }

    const state: BonusState = {
      version: CURRENT_VERSION,
      progressTickets: parsed.version === 1
        ? safeInteger(parsed.lifelines)
        : safeInteger(parsed.progressTickets),
      records,
    }
    const deadlineChanged = applyDeadlines(state, now)
    const migrated = parsed.version !== CURRENT_VERSION || Object.keys(records).length !== Object.keys(rawRecords).length
    if (raw !== null && (migrated || deadlineChanged)) {
      storage.setItem(storageKey(userId), JSON.stringify(state))
    }
    return state
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

function randomUnit(random: () => number): number {
  const roll = Number(random())
  return Number.isFinite(roll) ? Math.min(Math.max(roll, 0), 1 - Number.EPSILON) : 0
}

function randomIndex(length: number, random: () => number): number {
  if (length < 1) throw new Error('No bonus challenges are available for that difficulty.')
  return Math.floor(randomUnit(random) * length)
}

/**
 * Runs the day's 50% offer roll exactly once after a fully completed daily task.
 * A non-offer is persisted but intentionally returned as undefined to callers.
 */
export function offerDailyBonus(
  userId: string,
  daily: DailyView,
  storage: BonusStorage,
  random: () => number = Math.random,
  now = new Date(),
): BonusRecord | undefined {
  const { assignment, challenge, completion } = daily
  if (!assignment || !challenge || !completion || completion.verdict !== 'complete') return undefined

  const state = loadBonusState(userId, storage, now)
  const existing = state.records[daily.dateKey]
  if (existing) return existing.status === 'not-offered' ? undefined : existing

  const offered = randomUnit(random) < OFFER_CHANCE
  const record: BonusRecord = {
    dateKey: daily.dateKey,
    assignmentId: assignment.id,
    status: offered ? 'offered' : 'not-offered',
    offeredAt: now.toISOString(),
    deadlineAt: assignment.deadlineAt,
  }
  state.records[daily.dateKey] = record
  saveBonusState(userId, storage, state)
  return offered ? record : undefined
}

/** Accepting is the point of commitment and performs the two independent spins. */
export function acceptBonusChallenge(
  userId: string,
  dateKey: string,
  storage: BonusStorage,
  random: () => number = Math.random,
  now = new Date(),
): { state: BonusState; record: BonusRecord } {
  const state = loadBonusState(userId, storage, now)
  const record = state.records[dateKey]
  if (!record || record.status === 'not-offered') throw new Error('That bonus challenge was not offered.')
  if (record.status === 'committed' || record.status === 'completed' || record.status === 'penalty-required') {
    return { state, record }
  }
  if (record.status !== 'offered') throw new Error('That bonus offer is no longer available.')
  if (now.getTime() > Date.parse(record.deadlineAt)) {
    record.status = 'expired'
    state.records[dateKey] = record
    saveBonusState(userId, storage, state)
    throw new Error('That bonus offer has expired.')
  }

  const selectedDifficulty = difficultyLevels[randomIndex(difficultyLevels.length, random)]
  const pool = challenges.filter(({ difficulty }) => difficulty === selectedDifficulty)
  const selectedChallenge = pool[randomIndex(pool.length, random)]
  record.status = 'committed'
  record.acceptedAt = now.toISOString()
  record.selectedDifficulty = selectedDifficulty
  record.challengeId = selectedChallenge.id
  record.selectedChallenge = selectedChallenge
  state.records[dateKey] = record
  return { state: saveBonusState(userId, storage, state), record }
}

export function completeBonusChallenge(
  userId: string,
  dateKey: string,
  storage: BonusStorage,
  now = new Date(),
): { state: BonusState; record: BonusRecord } {
  const state = loadBonusState(userId, storage, now)
  const record = state.records[dateKey]
  if (!record) throw new Error('That bonus challenge is not available.')
  if (record.status === 'completed') return { state, record }
  if (record.status === 'penalty-required') throw new Error('The bonus deadline has passed; the penalty is now required.')
  if (record.status !== 'committed') throw new Error('Accept the bonus challenge before completing it.')

  record.status = 'completed'
  record.completedAt = now.toISOString()
  state.records[dateKey] = record
  return { state: saveBonusState(userId, storage, state), record }
}

export function declineBonusChallenge(
  userId: string,
  dateKey: string,
  storage: BonusStorage,
  now = new Date(),
): { state: BonusState; record: BonusRecord } {
  const state = loadBonusState(userId, storage, now)
  const record = state.records[dateKey]
  if (!record || record.status === 'not-offered') throw new Error('That bonus challenge is not available.')
  if (record.status === 'offered') record.status = 'declined'
  else if (record.status === 'committed') throw new Error('An accepted bonus challenge cannot be declined.')
  state.records[dateKey] = record
  return { state: saveBonusState(userId, storage, state), record }
}

/** Retained solely for balances earned under the previous progress-ticket feature. */
export function spendProgressTicket(userId: string, storage: BonusStorage): BonusState {
  const state = loadBonusState(userId, storage)
  if (state.progressTickets < 1) throw new Error('You do not have a progress ticket to spend.')
  state.progressTickets -= 1
  return saveBonusState(userId, storage, state)
}

export function taskForBonus(record?: BonusRecord): BonusTask | undefined {
  if (!record) return undefined
  return record.selectedChallenge
    ?? (record.challengeId ? challenges.find(({ id }) => id === record.challengeId) : undefined)
}
