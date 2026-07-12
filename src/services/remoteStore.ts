import type {
  AssignmentStatus,
  Challenge,
  ChallengeBoundaryTag,
  ChallengeCategory,
  ChallengeReportReason,
  Completion,
  CompletionVerdict,
  DailyAssignment,
  DailyView,
  Difficulty,
  HistoryEntry,
  NotificationKind,
  NotificationRecord,
  Profile,
  RecoveryItem,
  ResetTask,
  UserSettings,
} from '../types'
import {
  type AppAuthUser,
  callRemoteRpc,
  getInsforge,
  restoreRemoteSession,
} from './insforge'

export interface AppSnapshot {
  profile: Profile
  daily: DailyView
  history: HistoryEntry[]
  notifications: NotificationRecord[]
  settings: UserSettings
}

export interface RemoteDeletionResult {
  deleted: boolean
  authAccountDeletionPending: boolean
  requestedAt: string
}

interface RemoteProfileRow {
  user_id: string
  display_name: string
  level: number
  streak: number
  courage_points: number
  timezone: string
  notification_hour_start: number
  notification_hour_end: number
  unlock_window_start?: string
  unlock_window_end?: string
  deadline_time?: string
  morning_reminder_time?: string
  morning_reminder_enabled?: boolean
  unlock_reminder_enabled?: boolean
  deadline_reminder_enabled?: boolean
  max_difficulty?: number
  notification_enabled: boolean
  boundaries: unknown
  disabled_categories: unknown
  disabled_boundary_tags: unknown
  proof_ai_consent?: boolean
  minimum_age_confirmed?: boolean
  accepted_terms_at?: string | null
  privacy_acknowledged_at?: string | null
  created_at: string
  updated_at?: string
}

interface RemoteChallengeRow {
  id: string
  title: string
  prompt: string
  why: string
  category: string
  difficulty: number
  estimated_minutes: number
  proof_hint: string
  suggested_script: string | null
  boundary_tags: unknown
  is_active?: boolean
}

interface RemoteAssignmentRow {
  id: string
  user_id: string
  challenge_id: string
  assignment_date: string
  unlock_at: string
  deadline_at: string
  status: string
  completion_score: number | null
  created_at: string
  updated_at?: string
  activated_at?: string | null
  completed_at?: string | null
  missed_at?: string | null
  points_awarded?: number
}

interface RemoteCompletionRow {
  id: string
  user_id: string
  assignment_id: string | null
  challenge_id: string
  score: number
  verdict: string | null
  note: string
  proof_name: string | null
  ai_feedback?: string | null
  points_awarded?: number
  completed_at: string
  created_at: string
}

interface RemoteRecoveryRow {
  id: string
  user_id: string
  source_assignment_id: string
  catalog_id: string | null
  title: string
  prompt: string
  difficulty: number
  status: string
  due_at: string
  escalation_level?: number
  last_escalated_at?: string | null
  completion_note?: string | null
  created_at: string
  completed_at?: string | null
}

interface RemoteRecoveryCatalogRow {
  id: string
  title: string
  prompt: string
  difficulty: number
  estimated_minutes: number
  private_only: boolean
  is_active?: boolean
}

interface RemoteNotificationRow {
  id: string
  user_id: string
  event_key: string
  kind: string
  title: string
  body: string
  available_at: string
  read_at: string | null
  created_at: string
}

interface EnsureDailyState {
  blocked: boolean
  reason:
    | 'challenge-locked'
    | 'recovery-required'
    | 'no-eligible-challenge'
    | 'account-deletion-pending'
    | null
  assignment: RemoteAssignmentRow | null
  challenge: RemoteChallengeRow | null
  recovery: RemoteRecoveryRow | null
  profile?: RemoteProfileRow | null
}

interface ReportChallengeResponse {
  report: unknown
  state: EnsureDailyState
  idempotent: boolean
}

interface DatabaseResult<T> {
  data: T | null
  error: unknown
}

const challengeCategories: ChallengeCategory[] = [
  'warm-up',
  'conversation',
  'assertiveness',
  'connection',
]

const boundaryTags: ChallengeBoundaryTag[] = [
  'direct-message',
  'voice-message',
  'invitation',
  'vulnerability',
]

const friendlyErrors: Array<[string, string]> = [
  ['AUTH_REQUIRED', 'Your session has expired. Sign in again to continue.'],
  ['ACCOUNT_DELETION_PENDING', 'This account is already queued for deletion.'],
  ['INVALID_NOTIFICATION_WINDOW', 'Choose a whole-hour unlock window between 6:00 AM and 7:00 PM.'],
  ['INVALID_DISABLED_CATEGORIES', 'One or more challenge categories are not supported.'],
  ['INVALID_DISABLED_BOUNDARY_TAGS', 'One or more challenge boundaries are not supported.'],
  ['INVALID_BOUNDARIES', 'Keep your boundary list to 25 short, privacy-safe items.'],
  ['RECOVERY_NOTE_REQUIRED', 'Write at least 12 characters about how you completed the recovery.'],
  ['RECOVERY_NOT_FOUND', 'That recovery task is no longer available. Refresh and try again.'],
  ['ASSIGNMENT_NOT_FOUND', 'That challenge is no longer available. Refresh and try again.'],
  ['ASSIGNMENT_CANNOT_BE_REPORTED', 'This challenge is already closed and cannot be replaced.'],
  ['REPORT_RATE_LIMIT_24_HOURS', 'You have reached today’s replacement limit. Try again tomorrow.'],
  ['REPORT_DETAILS_TOO_LONG', 'Keep report details under 1,000 characters.'],
  ['INVALID_REPORT_REASON', 'Choose one of the available report reasons.'],
  ['TOO_MANY_NOTIFICATION_IDS', 'Too many notifications were selected at once. Try again.'],
  ['DELETION_CONFIRMATION_REQUIRED', 'Type the exact deletion confirmation before continuing.'],
]

function errorText(error: unknown): string {
  if (!error) return ''
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>
    return [record.message, record.details, record.hint, record.code]
      .filter((part): part is string => typeof part === 'string' && part.length > 0)
      .join(' · ')
  }
  return String(error)
}

function remoteError(error: unknown, fallback: string): Error {
  const raw = errorText(error)
  const known = friendlyErrors.find(([code]) => raw.includes(code))
  return new Error(known?.[1] ?? (raw || fallback))
}

function requireData<T>(result: DatabaseResult<T>, fallback: string): T {
  if (result.error) throw remoteError(result.error, fallback)
  if (result.data === null || result.data === undefined) throw new Error(fallback)
  return result.data
}

function asObject<T>(value: unknown, fallback: string): T {
  const candidate = Array.isArray(value) && value.length === 1 ? value[0] : value
  if (!candidate || typeof candidate !== 'object') throw new Error(fallback)
  return candidate as T
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function clampInteger(value: unknown, minimum: number, maximum: number): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : minimum
  return Math.max(minimum, Math.min(maximum, numeric))
}

function difficulty(value: unknown): Difficulty {
  return clampInteger(value, 1, 5) as Difficulty
}

function recoverySeverity(value: unknown): RecoveryItem['severity'] {
  // The UI intentionally caps escalation at the reviewed, non-humiliating level 3.
  return clampInteger(value, 1, 3) as RecoveryItem['severity']
}

function category(value: unknown): ChallengeCategory {
  return challengeCategories.includes(value as ChallengeCategory)
    ? value as ChallengeCategory
    : 'warm-up'
}

function validBoundaryTags(value: unknown): ChallengeBoundaryTag[] {
  return stringArray(value).filter((tag): tag is ChallengeBoundaryTag =>
    boundaryTags.includes(tag as ChallengeBoundaryTag),
  )
}

function validCategories(value: unknown): ChallengeCategory[] {
  return stringArray(value).filter((item): item is ChallengeCategory =>
    challengeCategories.includes(item as ChallengeCategory),
  )
}

function localDateKey(timezone = 'UTC', at = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(at)
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value
    return `${part('year')}-${part('month')}-${part('day')}`
  } catch {
    return at.toISOString().slice(0, 10)
  }
}

function datePart(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback
  const match = /^\d{4}-\d{2}-\d{2}/.exec(value)
  return match?.[0] ?? fallback
}

function hourTime(value: unknown, fallback: number): string {
  return `${String(clampInteger(value, 0, 23) || fallback).padStart(2, '0')}:00`
}

function clockTime(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(value)
  return match ? `${match[1]}:${match[2]}` : fallback
}

function mapChallenge(row: RemoteChallengeRow): Challenge {
  return {
    id: String(row.id),
    title: String(row.title),
    prompt: String(row.prompt),
    why: String(row.why),
    category: category(row.category),
    difficulty: difficulty(row.difficulty),
    minutes: clampInteger(row.estimated_minutes, 1, 120),
    proofHint: String(row.proof_hint),
    script: row.suggested_script?.trim() || undefined,
    boundaryTags: validBoundaryTags(row.boundary_tags),
  }
}

function assignmentStatus(value: unknown): AssignmentStatus {
  switch (value) {
    case 'active': return 'available'
    case 'complete': return 'completed'
    case 'replaced': return 'reported'
    case 'locked':
    case 'partial':
    case 'missed':
      return value
    default:
      return 'missed'
  }
}

function mapAssignment(row: RemoteAssignmentRow, completion?: RemoteCompletionRow): DailyAssignment {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    dateKey: datePart(row.assignment_date, new Date(row.created_at).toISOString().slice(0, 10)),
    challengeId: String(row.challenge_id),
    status: assignmentStatus(row.status),
    unlockAt: String(row.unlock_at),
    deadlineAt: String(row.deadline_at),
    createdAt: String(row.created_at),
    completedAt: row.completed_at || completion?.completed_at || undefined,
    completionId: completion?.id,
  }
}

function completionVerdict(row: RemoteCompletionRow): CompletionVerdict {
  if (row.verdict === 'complete' || row.verdict === 'partial' || row.verdict === 'needs-more') {
    return row.verdict
  }
  if (row.score >= 72) return 'complete'
  return row.score > 0 ? 'partial' : 'needs-more'
}

function mapCompletion(row: RemoteCompletionRow, assignment?: RemoteAssignmentRow): Completion {
  return {
    id: String(row.id),
    assignmentId: row.assignment_id || undefined,
    challengeId: String(row.challenge_id),
    userId: String(row.user_id),
    dateKey: assignment?.assignment_date,
    score: clampInteger(row.score, 0, 100),
    verdict: completionVerdict(row),
    note: String(row.note || ''),
    completedAt: String(row.completed_at || row.created_at),
    proofName: row.proof_name || undefined,
    pointsAwarded: Math.max(0, Math.round(row.points_awarded || 0)),
  }
}

function mapRecovery(row: RemoteRecoveryRow, source?: RemoteAssignmentRow): RecoveryItem {
  const createdDate = datePart(row.created_at, new Date().toISOString().slice(0, 10))
  return {
    id: String(row.id),
    userId: String(row.user_id),
    sourceAssignmentId: String(row.source_assignment_id),
    taskId: String(row.catalog_id || row.id),
    status: row.status === 'complete' || row.status === 'waived' ? 'completed' : 'open',
    severity: recoverySeverity(row.difficulty),
    initialProgressScore: clampInteger(source?.completion_score ?? 0, 0, 100),
    escalationCount: Math.max(0, Math.round(row.escalation_level || 0)),
    createdAt: String(row.created_at),
    lastEscalatedDateKey: datePart(row.last_escalated_at, createdDate),
    completedAt: row.completed_at || undefined,
    completionNote: row.completion_note || undefined,
  }
}

function mapRecoveryTask(
  row: RemoteRecoveryRow,
  catalog?: RemoteRecoveryCatalogRow,
): ResetTask {
  return {
    id: String(row.catalog_id || row.id),
    title: String(catalog?.title || row.title),
    prompt: String(catalog?.prompt || row.prompt),
    difficulty: difficulty(catalog?.difficulty ?? row.difficulty),
    minutes: catalog ? clampInteger(catalog.estimated_minutes, 1, 120) : 5,
    privateOnly: catalog?.private_only ?? true,
  }
}

function notificationKind(value: string): NotificationKind {
  switch (value) {
    case 'morning-reminder': return 'morning'
    case 'challenge-unlocked': return 'unlocked'
    case 'deadline-reminder': return 'deadline'
    case 'recovery-created': return 'recovery-created'
    case 'recovery-escalated': return 'recovery-escalated'
    case 'recovery-complete': return 'recovery-completed'
    default: return 'unlocked'
  }
}

function eventEntityId(eventKey: string): string | undefined {
  const id = eventKey.split(':')[1]
  return id || undefined
}

function mapNotification(row: RemoteNotificationRow): NotificationRecord {
  const kind = notificationKind(row.kind)
  const entityId = eventEntityId(row.event_key)
  return {
    id: String(row.id),
    userId: String(row.user_id),
    kind,
    title: String(row.title),
    body: String(row.body),
    createdAt: String(row.available_at || row.created_at),
    readAt: row.read_at || undefined,
    assignmentId: ['morning', 'unlocked', 'deadline'].includes(kind) ? entityId : undefined,
    recoveryId: kind.startsWith('recovery-') ? entityId : undefined,
  }
}

function mapProfile(row: RemoteProfileRow | null | undefined, user: AppAuthUser): Profile {
  const backendName = row?.display_name?.trim()
  const name = !backendName || backendName === 'Courageous human' ? user.name : backendName
  return {
    id: String(row?.user_id || user.id),
    name: name || user.email.split('@')[0],
    email: user.email,
    level: clampInteger(row?.level, 1, 5),
    streak: Math.max(0, Math.round(row?.streak || 0)),
    couragePoints: Math.max(0, Math.round(row?.courage_points || 0)),
    boundaries: stringArray(row?.boundaries),
    createdAt: row?.created_at,
  }
}

function mapSettings(row: RemoteProfileRow | null | undefined, profile: Profile): UserSettings {
  const enabled = row?.notification_enabled ?? true
  return {
    unlockWindowStart: clockTime(row?.unlock_window_start, hourTime(row?.notification_hour_start, 10)),
    unlockWindowEnd: clockTime(row?.unlock_window_end, hourTime(row?.notification_hour_end, 18)),
    deadlineTime: clockTime(row?.deadline_time, '22:00'),
    morningReminderTime: clockTime(row?.morning_reminder_time, '08:00'),
    notificationsEnabled: enabled,
    morningReminderEnabled: row?.morning_reminder_enabled ?? enabled,
    unlockReminderEnabled: row?.unlock_reminder_enabled ?? enabled,
    deadlineReminderEnabled: row?.deadline_reminder_enabled ?? enabled,
    maxDifficulty: difficulty(row?.max_difficulty ?? Math.min(5, profile.level + 1)),
    disabledCategories: validCategories(row?.disabled_categories),
    disabledBoundaryTags: validBoundaryTags(row?.disabled_boundary_tags),
    boundaries: stringArray(row?.boundaries),
  }
}

function bestCompletionsByAssignment(rows: RemoteCompletionRow[]): Map<string, RemoteCompletionRow> {
  const result = new Map<string, RemoteCompletionRow>()
  for (const row of rows) {
    if (!row.assignment_id) continue
    const existing = result.get(row.assignment_id)
    if (
      !existing ||
      row.score > existing.score ||
      (row.score === existing.score && row.completed_at > existing.completed_at)
    ) {
      result.set(row.assignment_id, row)
    }
  }
  return result
}

function dailyStatus(row: RemoteAssignmentRow | null, state: EnsureDailyState): DailyView['status'] {
  if (state.blocked) return state.reason === 'no-eligible-challenge' ? 'unavailable' : 'blocked'
  if (!row) return 'unavailable'
  const mapped = assignmentStatus(row.status)
  return mapped === 'reported' ? 'unavailable' : mapped
}

function validClock(value: string, label: string): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error(`${label} must be a valid time.`)
  }
  return value
}

async function authenticatedUser(user?: AppAuthUser): Promise<AppAuthUser> {
  const current = user ?? await restoreRemoteSession()
  if (!current) throw new Error('Your session has expired. Sign in again to continue.')
  return current
}

async function remoteClient() {
  const client = await getInsforge()
  if (!client) throw new Error('InsForge is not configured for this build.')
  return client
}

async function remoteRpc<T>(
  name: string,
  parameters?: Record<string, unknown>,
  fallback = 'The synced operation failed. Try again.',
): Promise<T> {
  try {
    return await callRemoteRpc<T>(name, parameters)
  } catch (error) {
    throw remoteError(error, fallback)
  }
}

export async function loadRemoteSnapshot(user?: AppAuthUser): Promise<AppSnapshot> {
  const currentUser = await authenticatedUser(user)
  const client = await remoteClient()
  const rawState = await remoteRpc<unknown>(
    'ensure_daily_assignment',
    undefined,
    'Could not prepare today’s challenge.',
  )
  const state = asObject<EnsureDailyState>(rawState, 'The daily state response was incomplete.')

  const [assignmentsResult, challengesResult, recoveryCatalogResult, completionsResult, recoveriesResult, notificationsResult] =
    await Promise.all([
      client.database.from('daily_assignments').select('*').order('assignment_date', { ascending: false }).limit(120),
      client.database.from('challenge_catalog').select('*').order('difficulty', { ascending: true }),
      client.database.from('recovery_catalog').select('*').order('difficulty', { ascending: true }),
      client.database.from('challenge_completions').select('*').order('completed_at', { ascending: false }).limit(360),
      client.database.from('recovery_tasks').select('*').order('created_at', { ascending: false }).limit(120),
      client.database.from('notification_outbox').select('*').lte('available_at', new Date().toISOString()).order('available_at', { ascending: false }).limit(250),
    ])

  const assignments = requireData(
    assignmentsResult as DatabaseResult<RemoteAssignmentRow[]>,
    'Could not load your challenge history.',
  )
  const challenges = requireData(
    challengesResult as DatabaseResult<RemoteChallengeRow[]>,
    'Could not load the challenge catalog.',
  )
  const recoveryCatalog = requireData(
    recoveryCatalogResult as DatabaseResult<RemoteRecoveryCatalogRow[]>,
    'Could not load the recovery catalog.',
  )
  const completions = requireData(
    completionsResult as DatabaseResult<RemoteCompletionRow[]>,
    'Could not load your proof history.',
  )
  const recoveries = requireData(
    recoveriesResult as DatabaseResult<RemoteRecoveryRow[]>,
    'Could not load your recovery history.',
  )
  const notificationRows = requireData(
    notificationsResult as DatabaseResult<RemoteNotificationRow[]>,
    'Could not load your notifications.',
  )

  const profile = mapProfile(state.profile, currentUser)
  const settings = mapSettings(state.profile, profile)
  const challengeById = new Map(challenges.map((row) => [row.id, row]))
  const recoveryCatalogById = new Map(recoveryCatalog.map((row) => [row.id, row]))
  const assignmentById = new Map(assignments.map((row) => [row.id, row]))
  const bestCompletionByAssignment = bestCompletionsByAssignment(completions)
  const recoveryByAssignment = new Map(recoveries.map((row) => [row.source_assignment_id, row]))

  const history: HistoryEntry[] = assignments.map((row) => {
    const completionRow = bestCompletionByAssignment.get(row.id)
    const recoveryRow = recoveryByAssignment.get(row.id)
    // A locked card stays sealed in every UI surface, including Journey.
    const challengeRow = row.status === 'locked' ? undefined : challengeById.get(row.challenge_id)
    return {
      assignment: mapAssignment(row, completionRow),
      challenge: challengeRow ? mapChallenge(challengeRow) : undefined,
      completion: completionRow ? mapCompletion(completionRow, row) : undefined,
      recovery: recoveryRow ? mapRecovery(recoveryRow, row) : undefined,
    }
  })

  const notifications = notificationRows.map(mapNotification)
  const currentAssignmentRow = state.assignment
    ? state.assignment
    : state.recovery
      ? assignmentById.get(state.recovery.source_assignment_id) || null
      : null
  const currentCompletionRow = currentAssignmentRow
    ? bestCompletionByAssignment.get(currentAssignmentRow.id)
    : undefined
  const currentRecoveryRow = state.recovery
    ?? recoveries.find((row) => row.status === 'open')
    ?? null
  const visibleChallengeRow = state.challenge

  const daily: DailyView = {
    dateKey: state.assignment?.assignment_date || localDateKey(state.profile?.timezone),
    status: dailyStatus(state.assignment, state),
    assignment: currentAssignmentRow
      ? mapAssignment(currentAssignmentRow, currentCompletionRow)
      : undefined,
    // Respect the backend's challenge-locked response even though history uses the catalog.
    challenge: visibleChallengeRow ? mapChallenge(visibleChallengeRow) : undefined,
    completion: currentCompletionRow
      ? mapCompletion(currentCompletionRow, currentAssignmentRow || undefined)
      : undefined,
    recovery: currentRecoveryRow
      ? mapRecovery(currentRecoveryRow, assignmentById.get(currentRecoveryRow.source_assignment_id))
      : undefined,
    recoveryTask: currentRecoveryRow
      ? mapRecoveryTask(
          currentRecoveryRow,
          currentRecoveryRow.catalog_id
            ? recoveryCatalogById.get(currentRecoveryRow.catalog_id)
            : undefined,
        )
      : undefined,
    unlockAt: state.assignment?.unlock_at,
    deadlineAt: state.assignment?.deadline_at,
    unreadNotificationCount: notifications.filter((record) => !record.readAt).length,
  }

  return { profile, daily, history, notifications, settings }
}

export async function completeRemoteRecovery(recoveryId: string, note: string): Promise<AppSnapshot> {
  const normalizedId = recoveryId.trim()
  const normalizedNote = note.trim()
  if (!normalizedId) throw new Error('Choose a recovery task to complete.')
  if (normalizedNote.length < 12 || normalizedNote.length > 1000) {
    throw new Error('Write a private reflection between 12 and 1,000 characters.')
  }
  await remoteRpc<unknown>('complete_recovery_task', {
    p_recovery_id: normalizedId,
    p_completion_note: normalizedNote,
  }, 'Could not complete the recovery task.')
  return loadRemoteSnapshot()
}

export async function reportRemoteChallenge(
  assignmentId: string,
  reason: ChallengeReportReason,
  details: string,
): Promise<AppSnapshot> {
  const normalizedId = assignmentId.trim()
  const normalizedDetails = details.trim()
  if (!normalizedId) throw new Error('Choose a challenge to report.')
  if (normalizedDetails.length > 1000) throw new Error('Keep report details under 1,000 characters.')
  const response = await remoteRpc<unknown>('report_challenge', {
    p_assignment_id: normalizedId,
    p_reason: reason,
    p_details: normalizedDetails,
  }, 'Could not replace that challenge.')
  asObject<ReportChallengeResponse>(response, 'The replacement response was incomplete.')
  return loadRemoteSnapshot()
}

export async function updateRemoteSettings(
  patch: Partial<UserSettings>,
  profile?: Profile,
): Promise<AppSnapshot> {
  const parameters: Record<string, unknown> = {
    p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  }
  if (profile?.name.trim()) parameters.p_display_name = profile.name.trim()
  if (patch.notificationsEnabled !== undefined) {
    parameters.p_notification_enabled = patch.notificationsEnabled
  }
  if (patch.unlockWindowStart !== undefined) {
    parameters.p_unlock_window_start = validClock(patch.unlockWindowStart, 'Unlock start')
  }
  if (patch.unlockWindowEnd !== undefined) {
    parameters.p_unlock_window_end = validClock(patch.unlockWindowEnd, 'Unlock end')
  }
  if (patch.deadlineTime !== undefined) parameters.p_deadline_time = validClock(patch.deadlineTime, 'Deadline')
  if (patch.morningReminderTime !== undefined) parameters.p_morning_reminder_time = validClock(patch.morningReminderTime, 'Morning reminder')
  if (patch.morningReminderEnabled !== undefined) parameters.p_morning_reminder_enabled = patch.morningReminderEnabled
  if (patch.unlockReminderEnabled !== undefined) parameters.p_unlock_reminder_enabled = patch.unlockReminderEnabled
  if (patch.deadlineReminderEnabled !== undefined) parameters.p_deadline_reminder_enabled = patch.deadlineReminderEnabled
  if (patch.maxDifficulty !== undefined) parameters.p_max_difficulty = patch.maxDifficulty
  if (patch.boundaries !== undefined) parameters.p_boundaries = patch.boundaries
  if (patch.disabledCategories !== undefined) parameters.p_disabled_categories = patch.disabledCategories
  if (patch.disabledBoundaryTags !== undefined) {
    parameters.p_disabled_boundary_tags = patch.disabledBoundaryTags
  }

  await remoteRpc<unknown>(
    'update_profile_preferences',
    parameters,
    'Could not save your synced settings.',
  )
  return loadRemoteSnapshot(profile ? {
    id: profile.id,
    email: profile.email,
    name: profile.name,
  } : undefined)
}

export async function markRemoteNotification(notificationId: string): Promise<AppSnapshot> {
  const normalizedId = notificationId.trim()
  if (!normalizedId) throw new Error('Choose a notification to mark as read.')
  await remoteRpc<number>('mark_notifications_read', {
    p_notification_ids: [normalizedId],
  }, 'Could not mark that notification as read.')
  return loadRemoteSnapshot()
}

export async function markAllRemoteNotifications(): Promise<AppSnapshot> {
  const client = await remoteClient()
  // The RPC accepts at most 50 IDs. Read in bounded batches until the inbox is clear.
  for (let batch = 0; batch < 100; batch += 1) {
    const result = await client.database
      .from('notification_outbox')
      .select('id')
      .is('read_at', null)
      .lte('available_at', new Date().toISOString())
      .order('available_at', { ascending: false })
      .limit(50)
    const rows = requireData(
      result as DatabaseResult<Array<{ id: string }>>,
      'Could not load unread notifications.',
    )
    const ids = rows.map((row) => row.id).filter(Boolean)
    if (ids.length === 0) return loadRemoteSnapshot()
    await remoteRpc<number>(
      'mark_notifications_read',
      { p_notification_ids: ids },
      'Could not mark all notifications as read.',
    )
    if (ids.length < 50) return loadRemoteSnapshot()
  }
  throw new Error('The inbox is unusually large. Some notifications remain unread; try again.')
}

async function exportTable(table: string, orderColumn: string): Promise<unknown[]> {
  const client = await remoteClient()
  const pageSize = 500
  const rows: unknown[] = []
  for (let page = 0; page < 200; page += 1) {
    const start = page * pageSize
    const result = await client.database
      .from(table)
      .select('*')
      .order(orderColumn, { ascending: false })
      .range(start, start + pageSize - 1)
    const pageRows = requireData(
      result as DatabaseResult<unknown[]>,
      `Could not export ${table.replaceAll('_', ' ')}.`,
    )
    rows.push(...pageRows)
    if (pageRows.length < pageSize) return rows
  }
  throw new Error(`The ${table.replaceAll('_', ' ')} export is too large to finish safely in one request.`)
}

export async function exportRemoteData(): Promise<string> {
  const user = await authenticatedUser()
  const [profiles, assignments, attempts, completions, recoveries, notifications, reports] =
    await Promise.all([
      exportTable('profiles', 'created_at'),
      exportTable('daily_assignments', 'created_at'),
      exportTable('proof_verification_attempts', 'requested_at'),
      exportTable('challenge_completions', 'created_at'),
      exportTable('recovery_tasks', 'created_at'),
      exportTable('notification_outbox', 'created_at'),
      exportTable('challenge_reports', 'created_at'),
    ])
  return JSON.stringify({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    account: { id: user.id, email: user.email, name: user.name },
    data: { profiles, assignments, proofVerificationAttempts: attempts, completions, recoveries, notifications, reports },
  }, null, 2)
}

export async function deleteRemoteData(): Promise<RemoteDeletionResult> {
  const response = await remoteRpc<unknown>('delete_my_app_data', {
    p_confirmation: 'DELETE MY DATA',
  }, 'Could not delete your app data.')
  const result = asObject<Record<string, unknown>>(response, 'The deletion response was incomplete.')
  if (result.deleted !== true) throw new Error('The backend did not confirm data deletion.')
  return {
    deleted: true,
    authAccountDeletionPending: result.authAccountDeletionPending === true,
    requestedAt: typeof result.requestedAt === 'string' ? result.requestedAt : new Date().toISOString(),
  }
}
