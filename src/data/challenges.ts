import { deriveSchedule, localDateKey, stableHash } from '../domain/date'
import type {
  Challenge,
  ChallengeBoundaryTag,
  ChallengeCategory,
  ChallengeEvidenceType,
  ChallengeMode,
  Difficulty,
  ResetTask,
  UserSettings,
} from '../types'
import easy from '../../data/challenges/easy.json'
import medium from '../../data/challenges/medium.json'
import hard from '../../data/challenges/hard.json'
import extreme from '../../data/challenges/extreme.json'
import nightmare from '../../data/challenges/nightmare.json'
import manifest from '../../data/challenges/manifest.json'

interface RepositoryChallenge {
  id: string
  title: string
  prompt: string
  description: string
  category: ChallengeCategory
  estimatedMinutes: number
  timeWindow: 'single_session' | '1_day'
  mode: ChallengeMode
  participants: Challenge['participants']
  ageGroup: 'all' | 'teen_or_adult'
  requiresConsent: boolean
  intensity: string
  equipment?: string[]
  platforms?: string[]
  verification: {
    gradeableByVision: true
    acceptedEvidence: ChallengeEvidenceType[]
    captureInstructions: string
    successCriteria: string[]
    privacyNotes: string
  }
}

interface RepositoryLevel {
  schemaVersion: 1
  level: 'easy' | 'medium' | 'hard' | 'extreme' | 'nightmare'
  challengeCount: number
  challenges: RepositoryChallenge[]
}

const levelDifficulty: Record<RepositoryLevel['level'], Difficulty> = {
  easy: 1,
  medium: 2,
  hard: 3,
  extreme: 4,
  nightmare: 5,
}

const categoryWhy: Record<Exclude<ChallengeCategory, 'warm-up' | 'conversation' | 'assertiveness' | 'connection'>, string> = {
  coding: 'Building something concrete turns a large technical idea into a finishable, visible result.',
  comedy: 'Playful discomfort makes it easier to practice being seen without needing to be perfect.',
  cooking: 'A practical creation gives effort, planning, and experimentation a tangible finish line.',
  creative: 'Making and sharing a finished artifact builds confidence through visible follow-through.',
  fitness: 'A scalable physical task builds momentum by pairing a clear target with safe movement.',
  kindness: 'A specific helpful action strengthens connection while keeping the focus on another person’s needs.',
  outdoors: 'A planned change of setting creates a concrete adventure while preserving safety and choice.',
  productivity: 'Closing one bounded loop builds trust in your ability to start, focus, and finish.',
  skill: 'Deliberate practice makes progress observable and turns unfamiliar work into a repeatable skill.',
  social: 'A consent-respecting social action creates a real opportunity to practice initiative and connection.',
  wellness: 'A bounded reset supports attention and self-awareness without demanding perfection.',
}

function derivedBoundaryTags(challenge: RepositoryChallenge): ChallengeBoundaryTag[] {
  const tags = new Set<ChallengeBoundaryTag>()
  const prompt = challenge.prompt.toLowerCase()
  if (challenge.requiresConsent) tags.add('requires-consent')
  if (challenge.mode === 'group') tags.add('group-activity')
  if (challenge.platforms?.length) tags.add('social-platform')
  if (challenge.category === 'fitness' || challenge.category === 'outdoors') tags.add('physical-activity')
  if (/\bvoice (?:note|message)|audio message\b/.test(prompt)) tags.add('voice-message')
  if (/\b(?:dm|direct message|message|text|instagram)\b/.test(prompt)) tags.add('direct-message')
  if (/\b(?:invite|invitation|ask (?:someone|them) out)\b/.test(prompt)) tags.add('invitation')
  if (/\b(?:vulnerable|personal story|meaningful|appreciation)\b/.test(prompt)) tags.add('vulnerability')
  return [...tags]
}

function adaptLevel(source: RepositoryLevel): Challenge[] {
  if (source.challengeCount !== source.challenges.length) {
    throw new Error(`Challenge count mismatch in ${source.level}.json`)
  }
  const difficulty = levelDifficulty[source.level]
  return source.challenges.map((challenge) => ({
    id: challenge.id,
    title: challenge.title,
    prompt: challenge.prompt,
    description: challenge.description,
    why: categoryWhy[challenge.category as keyof typeof categoryWhy],
    category: challenge.category,
    difficulty,
    minutes: challenge.estimatedMinutes,
    proofHint: challenge.verification.captureInstructions,
    boundaryTags: derivedBoundaryTags(challenge),
    timeWindow: challenge.timeWindow,
    mode: challenge.mode,
    participants: challenge.participants,
    ageGroup: challenge.ageGroup,
    requiresConsent: challenge.requiresConsent,
    intensity: challenge.intensity,
    equipment: challenge.equipment,
    platforms: challenge.platforms,
    acceptedEvidence: challenge.verification.acceptedEvidence,
    successCriteria: challenge.verification.successCriteria,
    privacyNotes: challenge.verification.privacyNotes,
    datasetVersion: manifest.datasetVersion,
  }))
}

const repositoryLevels = [easy, medium, hard, extreme, nightmare] as RepositoryLevel[]

export const challenges: Challenge[] = repositoryLevels.flatMap(adaptLevel)

if (challenges.length !== manifest.totalChallenges || new Set(challenges.map(({ id }) => id)).size !== challenges.length) {
  throw new Error('Repository challenge manifest does not match the loaded catalog')
}

export const resetTasks: ResetTask[] = [
  {
    id: 'reflection-60',
    title: 'The 60-second debrief',
    prompt: 'Record a private note: what got in the way, what was in your control, and the smallest version you could try tomorrow.',
    difficulty: 1,
    minutes: 3,
    privateOnly: true,
  },
  {
    id: 'micro-hello',
    title: 'Three tiny hellos',
    prompt: 'Make eye contact and say hello to three people in ordinary, appropriate settings.',
    difficulty: 2,
    minutes: 10,
    privateOnly: true,
  },
  {
    id: 'repair-message',
    title: 'Close one open loop',
    prompt: 'Reply to one message you have been avoiding with a short, honest response. You review and send it yourself.',
    difficulty: 3,
    minutes: 10,
    privateOnly: true,
  },
]

/**
 * Compatibility helper for simple views. The full app uses ChallengeEngine, which
 * also accounts for reports, boundaries, prior assignments, and recovery locks.
 */
export function getDailyChallenge(
  date = new Date(),
  level = 2,
  userId = 'demo-user',
  previousChallengeId?: string,
) {
  const dayKey = localDateKey(date)
  const eligible = challenges.filter((challenge) => challenge.difficulty <= Math.min(5, level + 1))
  const withoutRepeat = eligible.filter((challenge) => challenge.id !== previousChallengeId)
  const pool = withoutRepeat.length > 0 ? withoutRepeat : eligible
  return pool[stableHash(`${userId}:${dayKey}:challenge`) % pool.length]
}

const compatibilitySettings: UserSettings = {
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
  boundaries: [],
}

export function getUnlockTime(
  date = new Date(),
  userId = 'demo-user',
  settings: UserSettings = compatibilitySettings,
) {
  return deriveSchedule(userId, localDateKey(date), settings).unlockAt
}

export function formatUnlockTime(date = new Date()) {
  return getUnlockTime(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}
