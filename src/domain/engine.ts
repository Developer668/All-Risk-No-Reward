import { challenges as defaultChallenges, resetTasks as defaultResetTasks } from '../data/challenges'
import type {
  Challenge,
  ChallengeReportReason,
  Completion,
  DailyAssignment,
  DailyView,
  Difficulty,
  HistoryEntry,
  NotificationRecord,
  Profile,
  RecoveryItem,
  ResetTask,
  SubmitCompletionInput,
  SubmitCompletionResult,
  UserDomainState,
  UserSettings,
} from '../types'
import {
  addLocalDays,
  calendarDayDifference,
  deriveSchedule,
  localDateKey,
  localDateTime,
  stableHash,
  timeToMinutes,
  validateScheduleSettings,
} from './date'

const COMPLETE_SCORE = 72
const BASE_POINTS = 120
const MAX_RECOVERY_SEVERITY = 5
const MAX_RECOVERY_ESCALATIONS = 4
const MAX_RECOVERY_REROLLS = 2

export const DEFAULT_SETTINGS: UserSettings = {
  unlockWindowStart: '10:00',
  unlockWindowEnd: '18:00',
  deadlineTime: '22:00',
  morningReminderTime: '08:00',
  notificationsEnabled: true,
  morningReminderEnabled: true,
  unlockReminderEnabled: true,
  deadlineReminderEnabled: true,
  maxDifficulty: 3,
  disabledCategories: [],
  disabledBoundaryTags: [],
  boundaries: ['No public posting', 'No romantic dares', 'No contact sharing'],
}

export type DomainErrorCode =
  | 'ASSIGNMENT_NOT_FOUND'
  | 'ASSIGNMENT_LOCKED'
  | 'ASSIGNMENT_CLOSED'
  | 'RECOVERY_NOT_FOUND'
  | 'INVALID_SCORE'
  | 'INVALID_NOTE'
  | 'INVALID_SETTINGS'
  | 'CHALLENGE_NOT_FOUND'
  | 'REROLL_LIMIT_REACHED'
  | 'RECOVERY_CATALOG_EXHAUSTED'

export class DomainError extends Error {
  constructor(public readonly code: DomainErrorCode, message: string) {
    super(message)
    this.name = 'DomainError'
  }
}

export interface CreateUserStateInput {
  id: string
  name: string
  email: string
  now?: Date
  settings?: Partial<UserSettings>
}

export interface ReportChallengeInput {
  challengeId: string
  assignmentId?: string
  reason: ChallengeReportReason
  details?: string
}

function copyState(state: UserDomainState): UserDomainState {
  return JSON.parse(JSON.stringify(state)) as UserDomainState
}

function mergeSettings(settings?: Partial<UserSettings>): UserSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    disabledCategories: [...(settings?.disabledCategories ?? DEFAULT_SETTINGS.disabledCategories)],
    disabledBoundaryTags: [...(settings?.disabledBoundaryTags ?? DEFAULT_SETTINGS.disabledBoundaryTags)],
    boundaries: [...(settings?.boundaries ?? DEFAULT_SETTINGS.boundaries)],
  }
}

export function createUserState(input: CreateUserStateInput): UserDomainState {
  const now = input.now ?? new Date()
  const settings = mergeSettings(input.settings)
  validateScheduleSettings(settings)
  const profile: Profile = {
    id: input.id,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    level: 1,
    streak: 0,
    couragePoints: 0,
    boundaries: [...settings.boundaries],
    createdAt: now.toISOString(),
  }

  return {
    schemaVersion: 1,
    profile,
    settings,
    assignments: [],
    completions: [],
    recoveries: [],
    notifications: [],
    reports: [],
    assignedRecoveryTaskIds: [],
  }
}

function isOpenAssignment(assignment: DailyAssignment) {
  return assignment.status === 'locked' || assignment.status === 'available'
}

function latestByDate<T extends { dateKey: string; createdAt: string }>(items: T[]): T | undefined {
  return [...items].sort((left, right) =>
    right.dateKey.localeCompare(left.dateKey) || right.createdAt.localeCompare(left.createdAt),
  )[0]
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export class ChallengeEngine {
  private state: UserDomainState

  constructor(
    state: UserDomainState,
    private readonly catalog: Challenge[] = defaultChallenges,
    private readonly recoveryCatalog: ResetTask[] = defaultResetTasks,
    private readonly random: () => number = Math.random,
  ) {
    this.state = copyState(state)
    this.state.settings = mergeSettings(this.state.settings)
    this.normalizeRecoveryHistory()
    validateScheduleSettings(this.state.settings)
  }

  getState(): UserDomainState {
    return copyState(this.state)
  }

  sync(now = new Date()): DailyView {
    const dateKey = localDateKey(now)
    const unavailableOpenAssignment = this.retireUnavailableOpenAssignments(dateKey)
    this.closeExpiredAssignments(now)
    this.refreshStreak(dateKey)
    this.escalateRecovery(dateKey, now)

    const current = this.currentAssignment(dateKey)
    const recovery = this.openRecovery()
    const deadlineToday = localDateTime(dateKey, timeToMinutes(this.state.settings.deadlineTime))

    if (!current && !recovery && now.getTime() <= deadlineToday.getTime()) {
      this.createAssignment(dateKey, now, unavailableOpenAssignment?.id)
    }

    this.refreshCurrentAssignment(now)
    this.closeExpiredAssignments(now)
    this.createTimedNotifications(now)
    return this.buildView(now)
  }

  submitCompletion(input: SubmitCompletionInput, now = new Date()): SubmitCompletionResult {
    this.sync(now)
    if (!Number.isFinite(input.score) || input.score < 0 || input.score > 100) {
      throw new DomainError('INVALID_SCORE', 'Proof score must be between 0 and 100.')
    }
    if (input.note.trim().length < 3) {
      throw new DomainError('INVALID_NOTE', 'Add a short, privacy-safe note about what happened.')
    }

    const assignment = this.state.assignments.find((item) => item.id === input.assignmentId)
    if (!assignment) throw new DomainError('ASSIGNMENT_NOT_FOUND', 'That daily challenge could not be found.')
    if (assignment.status === 'locked') {
      throw new DomainError('ASSIGNMENT_LOCKED', 'This challenge has not unlocked yet.')
    }
    if (assignment.status !== 'available') {
      throw new DomainError('ASSIGNMENT_CLOSED', 'This challenge is already closed.')
    }
    if (now.getTime() > new Date(assignment.deadlineAt).getTime()) {
      this.sync(now)
      throw new DomainError('ASSIGNMENT_CLOSED', 'The proof deadline has passed.')
    }

    const score = Math.round(input.score)
    const verdict = score >= COMPLETE_SCORE ? 'complete' : score >= 25 ? 'partial' : 'needs-more'
    const pointsAwarded = verdict === 'complete' ? BASE_POINTS : verdict === 'partial' ? 60 : 0
    const completion: Completion = {
      id: `completion:${assignment.id}`,
      assignmentId: assignment.id,
      userId: this.state.profile.id,
      dateKey: assignment.dateKey,
      challengeId: assignment.challengeId,
      score,
      note: input.note.trim(),
      proofName: input.proofName,
      completedAt: now.toISOString(),
      verdict,
      pointsAwarded,
    }

    // A low-confidence proof check is feedback, not a completed attempt. Keep
    // the same challenge open so the user can add detail or make more progress.
    if (verdict === 'needs-more') {
      return { view: this.buildView(now), completion: { ...completion } }
    }

    assignment.status = verdict === 'complete' ? 'completed' : 'partial'
    assignment.completedAt = completion.completedAt
    assignment.completionId = completion.id
    this.state.completions.push(completion)
    this.state.profile.couragePoints += pointsAwarded
    this.state.profile.level = Math.min(5, Math.floor(this.state.profile.couragePoints / 500) + 1)

    let recovery: RecoveryItem | undefined
    if (verdict === 'complete') {
      this.state.profile.streak = this.calculateStreak(assignment.dateKey)
      this.addNotification({
        id: `completed:${assignment.id}`,
        kind: 'completed',
        title: 'Challenge logged',
        body: `You earned ${pointsAwarded} courage points.`,
        createdAt: now.toISOString(),
        assignmentId: assignment.id,
      })
    } else {
      this.state.profile.streak = 0
      recovery = this.createRecovery(assignment, score, now)
    }

    return { view: this.buildView(now), completion: { ...completion }, recovery: recovery && { ...recovery } }
  }

  completeRecovery(recoveryId: string, note = '', now = new Date()): DailyView {
    this.sync(now)
    const recovery = this.state.recoveries.find((item) => item.id === recoveryId && item.status === 'open')
    if (!recovery) throw new DomainError('RECOVERY_NOT_FOUND', 'That recovery task is not open.')

    recovery.status = 'completed'
    recovery.completedAt = now.toISOString()
    recovery.completionNote = note.trim() || undefined
    this.addNotification({
      id: `recovery-completed:${recovery.id}`,
      kind: 'recovery-completed',
      title: 'Loop closed',
      body: 'Your next daily challenge can now unlock.',
      createdAt: now.toISOString(),
      recoveryId: recovery.id,
    })
    return this.sync(now)
  }

  rerollRecovery(recoveryId: string, now = new Date()): DailyView {
    this.sync(now)
    const recovery = this.state.recoveries.find((item) => item.id === recoveryId && item.status === 'open')
    if (!recovery) throw new DomainError('RECOVERY_NOT_FOUND', 'That recovery task is not open.')

    const rerollCount = recovery.rerollCount ?? 0
    if (rerollCount >= MAX_RECOVERY_REROLLS) {
      throw new DomainError('REROLL_LIMIT_REACHED', 'Both dice rolls are already used. This result is locked.')
    }

    const seen = new Set(this.state.assignedRecoveryTaskIds ?? [])
    seen.add(recovery.taskId)
    const available = this.recoveryCatalog.filter((task) => !seen.has(task.id))
    if (available.length === 0) {
      throw new DomainError(
        'RECOVERY_CATALOG_EXHAUSTED',
        'You have already seen every available punishment. Your current result stays in place.',
      )
    }

    const roll = this.random()
    const randomValue = Number.isFinite(roll)
      ? Math.max(0, Math.min(0.9999999999999999, roll))
      : 0
    const selected = available[Math.floor(randomValue * available.length)]
    recovery.taskId = selected.id
    recovery.severity = selected.difficulty
    recovery.rerollCount = rerollCount + 1
    this.rememberRecoveryTask(recovery, selected.id)
    return this.buildView(now)
  }

  updateSettings(patch: Partial<UserSettings>, now = new Date()): DailyView {
    const next = mergeSettings({ ...this.state.settings, ...patch })
    try {
      validateScheduleSettings(next)
    } catch (error) {
      throw new DomainError(
        'INVALID_SETTINGS',
        error instanceof Error ? error.message : 'Those schedule settings are invalid.',
      )
    }
    this.state.settings = next
    this.state.profile.boundaries = [...next.boundaries]
    return this.sync(now)
  }

  reportChallenge(input: ReportChallengeInput, now = new Date()): DailyView {
    this.sync(now)
    const challenge = this.catalog.find((item) => item.id === input.challengeId)
    if (!challenge) throw new DomainError('CHALLENGE_NOT_FOUND', 'That challenge could not be found.')

    const assignment = input.assignmentId
      ? this.state.assignments.find((item) => item.id === input.assignmentId)
      : undefined
    if (input.assignmentId && !assignment) {
      throw new DomainError('ASSIGNMENT_NOT_FOUND', 'That daily challenge could not be found.')
    }
    if (assignment && assignment.challengeId !== input.challengeId) {
      throw new DomainError('ASSIGNMENT_NOT_FOUND', 'That challenge does not match the assignment.')
    }
    const reportId = `report:${this.state.profile.id}:${input.challengeId}:${now.getTime()}`
    this.state.reports.push({
      id: reportId,
      userId: this.state.profile.id,
      challengeId: input.challengeId,
      assignmentId: assignment?.id,
      reason: input.reason,
      details: input.details?.trim() ?? '',
      createdAt: now.toISOString(),
    })

    if (assignment && isOpenAssignment(assignment)) {
      assignment.status = 'reported'
      this.createAssignment(assignment.dateKey, now, assignment.id)
      this.refreshCurrentAssignment(now)
    }
    return this.buildView(now)
  }

  getHistory(now = new Date()): HistoryEntry[] {
    this.sync(now)
    return [...this.state.assignments]
      .sort((left, right) =>
        right.dateKey.localeCompare(left.dateKey) || right.createdAt.localeCompare(left.createdAt),
      )
      .map((assignment) => ({
        assignment: { ...assignment },
        challenge: this.catalog.find((item) => item.id === assignment.challengeId),
        completion: this.state.completions.find((item) => item.assignmentId === assignment.id),
        recovery: this.state.recoveries.find((item) => item.sourceAssignmentId === assignment.id),
      }))
  }

  markNotificationRead(notificationId: string, now = new Date()): void {
    const notification = this.state.notifications.find((item) => item.id === notificationId)
    if (notification && !notification.readAt) notification.readAt = now.toISOString()
  }

  markAllNotificationsRead(now = new Date()): void {
    const readAt = now.toISOString()
    for (const notification of this.state.notifications) notification.readAt ??= readAt
  }

  private currentAssignment(dateKey: string): DailyAssignment | undefined {
    return latestByDate(
      this.state.assignments.filter((item) => item.dateKey === dateKey && item.status !== 'reported'),
    )
  }

  private retireUnavailableOpenAssignments(dateKey: string): DailyAssignment | undefined {
    const catalogIds = new Set(this.catalog.map((challenge) => challenge.id))
    const retiredToday: DailyAssignment[] = []

    for (const assignment of this.state.assignments) {
      if (!isOpenAssignment(assignment) || catalogIds.has(assignment.challengeId)) continue

      // Catalog upgrades may retire an item while it is still open on a device.
      // Do this before expiry handling so a removed card can never create a
      // no-fault punishment. Completed and partial history stays untouched.
      assignment.status = 'reported'
      if (assignment.dateKey === dateKey) retiredToday.push(assignment)
    }

    return latestByDate(retiredToday)
  }

  private openRecovery(): RecoveryItem | undefined {
    return this.state.recoveries.find((item) => item.status === 'open')
  }

  private eligibleChallenges(): Challenge[] {
    const reported = new Set(this.state.reports.map((report) => report.challengeId))
    const levelLimit = Math.min(
      this.state.settings.maxDifficulty,
      Math.min(5, this.state.profile.level + 1) as Difficulty,
    )
    return this.catalog.filter((challenge) =>
      challenge.difficulty <= levelLimit &&
      !this.state.settings.disabledCategories.includes(challenge.category) &&
      !(challenge.boundaryTags ?? []).some((tag) => this.state.settings.disabledBoundaryTags.includes(tag)) &&
      !reported.has(challenge.id),
    )
  }

  private createAssignment(dateKey: string, now: Date, replacementForAssignmentId?: string) {
    const eligible = this.eligibleChallenges()
    if (eligible.length === 0) return undefined

    const prior = latestByDate(
      this.state.assignments.filter((item) =>
        item.dateKey < dateKey && item.status !== 'reported',
      ),
    )
    const withoutRepeat = eligible.filter((challenge) => challenge.id !== prior?.challengeId)
    const pool = withoutRepeat.length > 0 ? withoutRepeat : eligible
    const replacementIndex = this.state.assignments.filter((item) => item.dateKey === dateKey).length
    const selected = pool[
      stableHash(`${this.state.profile.id}:${dateKey}:challenge:${replacementIndex}`) % pool.length
    ]
    const schedule = deriveSchedule(this.state.profile.id, dateKey, this.state.settings)
    const assignment: DailyAssignment = {
      id: `assignment:${this.state.profile.id}:${dateKey}:${selected.id}:${replacementIndex}`,
      userId: this.state.profile.id,
      dateKey,
      challengeId: selected.id,
      status: now.getTime() >= schedule.unlockAt.getTime() ? 'available' : 'locked',
      unlockAt: schedule.unlockAt.toISOString(),
      deadlineAt: schedule.deadlineAt.toISOString(),
      createdAt: now.toISOString(),
      replacementForAssignmentId,
    }
    this.state.assignments.push(assignment)
    return assignment
  }

  private refreshCurrentAssignment(now: Date) {
    const assignment = this.currentAssignment(localDateKey(now))
    if (!assignment || !isOpenAssignment(assignment)) return
    if (now.getTime() >= new Date(assignment.unlockAt).getTime()) assignment.status = 'available'
    else assignment.status = 'locked'
  }

  private closeExpiredAssignments(now: Date) {
    for (const assignment of this.state.assignments) {
      if (!isOpenAssignment(assignment)) continue
      if (now.getTime() <= new Date(assignment.deadlineAt).getTime()) continue
      assignment.status = 'missed'
      this.state.profile.streak = 0
      this.createRecovery(assignment, 0, now)
    }
  }

  private recoverySeverity(score: number): 1 | 2 | 3 {
    if (score >= 60) return 1
    if (score >= 25) return 2
    return 3
  }

  private recoveryTaskFor(severity: number, seed: string): ResetTask | undefined {
    const seen = new Set(this.state.assignedRecoveryTaskIds ?? [])
    const unseen = this.recoveryCatalog.filter((task) => !seen.has(task.id))
    const exact = unseen.filter((task) => task.difficulty === severity)
    const pool = exact.length > 0
      ? exact
      : unseen.filter((task) => task.difficulty <= severity)
    if (pool.length === 0) return undefined
    return pool[stableHash(seed) % pool.length]
  }

  private escalationTaskFor(previous: number, target: number, seed: string): ResetTask | undefined {
    const seen = new Set(this.state.assignedRecoveryTaskIds ?? [])
    const candidates = this.recoveryCatalog.filter((task) =>
      !seen.has(task.id) && task.difficulty > previous && task.difficulty <= target,
    )
    if (candidates.length === 0) return undefined
    const nextDifficulty = Math.max(...candidates.map((task) => task.difficulty))
    const pool = candidates.filter((task) => task.difficulty === nextDifficulty)
    return pool[stableHash(seed) % pool.length]
  }

  private createRecovery(assignment: DailyAssignment, score: number, now: Date): RecoveryItem | undefined {
    const existing = this.state.recoveries.find((item) => item.sourceAssignmentId === assignment.id)
    if (existing) return existing
    const open = this.openRecovery()
    if (open) return open

    const severity = this.recoverySeverity(score)
    const task = this.recoveryTaskFor(severity, assignment.id)
    // A finite catalog can eventually run out. Never repeat an old punishment
    // or trap the user behind an impossible recovery when that happens.
    if (!task) return undefined
    const recovery: RecoveryItem = {
      id: `recovery:${assignment.id}`,
      userId: this.state.profile.id,
      sourceAssignmentId: assignment.id,
      taskId: task.id,
      status: 'open',
      severity,
      initialProgressScore: score,
      escalationCount: 0,
      rerollCount: 0,
      assignedTaskIds: [task.id],
      createdAt: now.toISOString(),
      lastEscalatedDateKey: localDateKey(now),
    }
    this.state.recoveries.push(recovery)
    this.rememberRecoveryTask(recovery, task.id)
    this.addNotification({
      id: `recovery-created:${recovery.id}`,
      kind: 'recovery-created',
      title: score > 0 ? 'Progress saved—close the loop' : 'A gentle reset is ready',
      body: `${task.title} must be completed before the next challenge unlocks.`,
      createdAt: now.toISOString(),
      assignmentId: assignment.id,
      recoveryId: recovery.id,
    })
    return recovery
  }

  private escalateRecovery(dateKey: string, now: Date) {
    const recovery = this.openRecovery()
    if (!recovery) return
    const elapsedDays = calendarDayDifference(recovery.lastEscalatedDateKey, dateKey)
    if (elapsedDays <= 0 || recovery.escalationCount >= MAX_RECOVERY_ESCALATIONS) return

    const availableEscalations = MAX_RECOVERY_ESCALATIONS - recovery.escalationCount
    const applied = Math.min(elapsedDays, availableEscalations)
    const previousSeverity = recovery.severity
    const targetSeverity = Math.min(
      MAX_RECOVERY_SEVERITY,
      recovery.severity + applied,
    ) as RecoveryItem['severity']
    recovery.lastEscalatedDateKey = dateKey
    const task = this.escalationTaskFor(
      previousSeverity,
      targetSeverity,
      `${recovery.id}:${targetSeverity}`,
    )
    if (!task) return

    recovery.severity = task.difficulty
    recovery.escalationCount += applied
    recovery.taskId = task.id
    this.rememberRecoveryTask(recovery, task.id)

    if (recovery.severity > previousSeverity) {
      this.addNotification({
        id: `recovery-escalated:${recovery.id}:${dateKey}`,
        kind: 'recovery-escalated',
        title: 'Your reset stepped up one level',
        body: `${task.title} is still private, legal, and capped at level ${MAX_RECOVERY_SEVERITY}.`,
        createdAt: now.toISOString(),
        recoveryId: recovery.id,
      })
    }
  }

  private calculateStreak(completedDateKey: string): number {
    const dates = new Set(
      this.state.assignments
        .filter((assignment) => assignment.status === 'completed')
        .map((assignment) => assignment.dateKey),
    )
    let streak = 0
    let cursor = completedDateKey
    while (dates.has(cursor)) {
      streak += 1
      cursor = addLocalDays(cursor, -1)
    }
    return streak
  }

  private refreshStreak(dateKey: string) {
    const latestCompleted = latestByDate(
      this.state.assignments.filter((assignment) => assignment.status === 'completed'),
    )
    if (!latestCompleted) {
      this.state.profile.streak = 0
      return
    }
    if (latestCompleted.dateKey !== dateKey && latestCompleted.dateKey !== addLocalDays(dateKey, -1)) {
      this.state.profile.streak = 0
      return
    }
    this.state.profile.streak = this.calculateStreak(latestCompleted.dateKey)
  }

  private addNotification(input: Omit<NotificationRecord, 'userId'>) {
    if (!this.state.settings.notificationsEnabled) return
    if (this.state.notifications.some((item) => item.id === input.id)) return
    this.state.notifications.push({ ...input, userId: this.state.profile.id })
  }

  private normalizeRecoveryHistory() {
    const history = new Set(this.state.assignedRecoveryTaskIds ?? [])
    for (const recovery of this.state.recoveries) {
      recovery.rerollCount = Math.max(0, Math.min(MAX_RECOVERY_REROLLS, recovery.rerollCount ?? 0))
      const assigned = recovery.assignedTaskIds?.length
        ? recovery.assignedTaskIds
        : recovery.taskId ? [recovery.taskId] : []
      recovery.assignedTaskIds = [...new Set(assigned)]
      for (const taskId of recovery.assignedTaskIds) history.add(taskId)
      if (recovery.taskId) history.add(recovery.taskId)
    }
    this.state.assignedRecoveryTaskIds = [...history]
  }

  private rememberRecoveryTask(recovery: RecoveryItem, taskId: string) {
    recovery.assignedTaskIds ??= []
    if (!recovery.assignedTaskIds.includes(taskId)) recovery.assignedTaskIds.push(taskId)
    this.state.assignedRecoveryTaskIds ??= []
    if (!this.state.assignedRecoveryTaskIds.includes(taskId)) {
      this.state.assignedRecoveryTaskIds.push(taskId)
    }
  }

  private createTimedNotifications(now: Date) {
    if (!this.state.settings.notificationsEnabled) return
    const dateKey = localDateKey(now)
    const assignment = this.currentAssignment(dateKey)
    if (!assignment) return
    const schedule = deriveSchedule(this.state.profile.id, dateKey, this.state.settings)

    if (this.state.settings.morningReminderEnabled && now.getTime() >= schedule.morningAt.getTime()) {
      this.addNotification({
        id: `morning:${this.state.profile.id}:${dateKey}`,
        kind: 'morning',
        title: 'A brave thing is coming',
        body: `Today’s challenge unlocks at ${formatTime(assignment.unlockAt)}.`,
        createdAt: schedule.morningAt.toISOString(),
        assignmentId: assignment.id,
      })
    }
    if (this.state.settings.unlockReminderEnabled && now.getTime() >= new Date(assignment.unlockAt).getTime()) {
      this.addNotification({
        id: `unlocked:${assignment.id}`,
        kind: 'unlocked',
        title: 'Today’s challenge is unlocked',
        body: `You have until ${formatTime(assignment.deadlineAt)} to show your progress.`,
        createdAt: assignment.unlockAt,
        assignmentId: assignment.id,
      })
    }
    const deadlineReminderAt = new Date(new Date(assignment.deadlineAt).getTime() - 60 * 60 * 1000)
    if (
      this.state.settings.deadlineReminderEnabled &&
      isOpenAssignment(assignment) &&
      now.getTime() >= deadlineReminderAt.getTime() &&
      now.getTime() <= new Date(assignment.deadlineAt).getTime()
    ) {
      this.addNotification({
        id: `deadline:${assignment.id}`,
        kind: 'deadline',
        title: 'One hour left',
        body: 'A partial attempt still counts and creates a gentler recovery task.',
        createdAt: deadlineReminderAt.toISOString(),
        assignmentId: assignment.id,
      })
    }
  }

  private buildView(now: Date): DailyView {
    const dateKey = localDateKey(now)
    const assignment = this.currentAssignment(dateKey)
    const recovery = this.openRecovery()
    const challenge = assignment
      ? this.catalog.find((item) => item.id === assignment.challengeId)
      : undefined
    const completion = assignment
      ? this.state.completions.find((item) => item.assignmentId === assignment.id)
      : undefined
    const recoveryTask = recovery
      ? this.recoveryCatalog.find((item) => item.id === recovery.taskId)
      : undefined
    const rerollCount = recovery?.rerollCount ?? 0
    const unseenRecoveryTasks = recovery
      ? this.recoveryCatalog.filter((task) =>
          !(this.state.assignedRecoveryTaskIds ?? []).includes(task.id),
        ).length
      : 0
    const recoveryRerollStatus = recovery
      ? rerollCount >= MAX_RECOVERY_REROLLS
        ? 'limit-reached'
        : unseenRecoveryTasks === 0
          ? 'catalog-exhausted'
          : 'available'
      : undefined

    let status: DailyView['status'] = 'unavailable'
    if (recovery) status = 'blocked'
    else if (assignment) status = assignment.status === 'reported' ? 'unavailable' : assignment.status

    return {
      dateKey,
      status,
      assignment: assignment && { ...assignment },
      challenge,
      completion: completion && { ...completion },
      recovery: recovery && { ...recovery },
      recoveryTask,
      unlockAt: assignment?.unlockAt,
      deadlineAt: assignment?.deadlineAt,
      unreadNotificationCount: this.state.notifications.filter((item) => !item.readAt).length,
      recoveryRerollStatus,
      recoveryRerollsRemaining: recovery ? Math.max(0, MAX_RECOVERY_REROLLS - rerollCount) : undefined,
    }
  }
}
