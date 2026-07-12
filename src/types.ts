export type Difficulty = 1 | 2 | 3 | 4 | 5

export type ChallengeCategory = 'warm-up' | 'conversation' | 'assertiveness' | 'connection'

export type ChallengeBoundaryTag =
  | 'direct-message'
  | 'voice-message'
  | 'invitation'
  | 'vulnerability'

export interface Challenge {
  id: string
  title: string
  prompt: string
  why: string
  category: ChallengeCategory
  difficulty: Difficulty
  minutes: number
  proofHint: string
  script?: string
  boundaryTags?: ChallengeBoundaryTag[]
}

export interface ResetTask {
  id: string
  title: string
  prompt: string
  difficulty: Difficulty
  minutes: number
  privateOnly: boolean
}

export type CompletionVerdict = 'complete' | 'partial' | 'needs-more'

/** A privacy-safe proof result. Image contents are deliberately never persisted locally. */
export interface Completion {
  challengeId: string
  score: number
  note: string
  completedAt: string
  proofName?: string
  id?: string
  assignmentId?: string
  userId?: string
  dateKey?: string
  verdict?: CompletionVerdict
  pointsAwarded?: number
}

export interface Profile {
  id: string
  name: string
  email: string
  level: number
  streak: number
  couragePoints: number
  boundaries: string[]
  createdAt?: string
}

export interface ProofAssessment {
  score: number
  verdict: CompletionVerdict
  feedback: string
}

export interface UserSettings {
  /** Inclusive local-time start of the random unlock window, in HH:MM. */
  unlockWindowStart: string
  /** Exclusive local-time end of the random unlock window, in HH:MM. */
  unlockWindowEnd: string
  /** Same-day proof deadline in local time, in HH:MM. */
  deadlineTime: string
  /** Time at which the inbox receives the morning heads-up, in HH:MM. */
  morningReminderTime: string
  notificationsEnabled: boolean
  morningReminderEnabled: boolean
  unlockReminderEnabled: boolean
  deadlineReminderEnabled: boolean
  maxDifficulty: Difficulty
  disabledCategories: ChallengeCategory[]
  disabledBoundaryTags: ChallengeBoundaryTag[]
  boundaries: string[]
}

export type AssignmentStatus =
  | 'locked'
  | 'available'
  | 'completed'
  | 'partial'
  | 'missed'
  | 'reported'

export interface DailyAssignment {
  id: string
  userId: string
  dateKey: string
  challengeId: string
  status: AssignmentStatus
  unlockAt: string
  deadlineAt: string
  createdAt: string
  completedAt?: string
  completionId?: string
  replacementForAssignmentId?: string
}

export type RecoveryStatus = 'open' | 'completed'

export interface RecoveryItem {
  id: string
  userId: string
  sourceAssignmentId: string
  taskId: string
  status: RecoveryStatus
  /** Operator-ranked catalog difficulty, from gentle (1) through hardest (5). */
  severity: Difficulty
  initialProgressScore: number
  escalationCount: number
  /** Dice rolls already spent on this recovery. Two is the permanent limit. */
  rerollCount?: number
  /** Ordered audit trail of every task shown during this recovery. */
  assignedTaskIds?: string[]
  createdAt: string
  lastEscalatedDateKey: string
  completedAt?: string
  completionNote?: string
}

export type NotificationKind =
  | 'morning'
  | 'unlocked'
  | 'deadline'
  | 'completed'
  | 'recovery-created'
  | 'recovery-escalated'
  | 'recovery-completed'

export interface NotificationRecord {
  id: string
  userId: string
  kind: NotificationKind
  title: string
  body: string
  createdAt: string
  readAt?: string
  assignmentId?: string
  recoveryId?: string
}

export type ChallengeReportReason =
  | 'crosses-boundary'
  | 'unsafe'
  | 'inappropriate'
  | 'not-accessible'
  | 'other'

export interface ChallengeReport {
  id: string
  userId: string
  challengeId: string
  assignmentId?: string
  reason: ChallengeReportReason
  details: string
  createdAt: string
}

export interface UserDomainState {
  schemaVersion: 1
  profile: Profile
  settings: UserSettings
  assignments: DailyAssignment[]
  completions: Completion[]
  recoveries: RecoveryItem[]
  notifications: NotificationRecord[]
  reports: ChallengeReport[]
  /** Account-scoped no-repeat history for recovery task assignment and rerolls. */
  assignedRecoveryTaskIds?: string[]
}

export type DailyViewStatus =
  | 'locked'
  | 'available'
  | 'completed'
  | 'partial'
  | 'missed'
  | 'blocked'
  | 'unavailable'

export interface DailyView {
  dateKey: string
  status: DailyViewStatus
  assignment?: DailyAssignment
  challenge?: Challenge
  completion?: Completion
  recovery?: RecoveryItem
  recoveryTask?: ResetTask
  unlockAt?: string
  deadlineAt?: string
  unreadNotificationCount: number
  /** Server- or device-owned state for the active punishment dice. */
  recoveryRerollStatus?: 'available' | 'limit-reached' | 'catalog-exhausted'
  recoveryRerollsRemaining?: number
}

export interface HistoryEntry {
  assignment: DailyAssignment
  challenge?: Challenge
  completion?: Completion
  recovery?: RecoveryItem
}

export interface SubmitCompletionInput {
  assignmentId: string
  score: number
  note: string
  proofName?: string
}

export interface SubmitCompletionResult {
  view: DailyView
  completion: Completion
  recovery?: RecoveryItem
}

export interface LocalSession {
  token: string
  userId: string
  createdAt: string
  expiresAt: string
}

export interface LocalAuthResult {
  session: LocalSession
  profile: Profile
}
