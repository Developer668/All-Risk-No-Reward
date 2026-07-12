import { deriveSchedule, localDateKey, stableHash } from '../domain/date'
import type { Challenge, ResetTask, UserSettings } from '../types'

export const challenges: Challenge[] = [
  {
    id: 'specific-compliment',
    title: 'Say the specific thing',
    prompt: 'Give someone a sincere compliment about a choice they made—not their appearance.',
    why: 'Specific appreciation trains you to initiate warmth without needing a perfect opening.',
    category: 'warm-up',
    difficulty: 1,
    minutes: 5,
    proofHint: 'Write what you said and how they responded. No names needed.',
    script: '“That was a really thoughtful way to handle ___.”',
  },
  {
    id: 'ask-recommendation',
    title: 'Borrow a good opinion',
    prompt: 'Ask someone you do not usually talk to for a recommendation: music, food, a show, or a local spot.',
    why: 'Low-stakes questions create natural conversation without forcing intimacy.',
    category: 'conversation',
    difficulty: 1,
    minutes: 8,
    proofHint: 'Share the recommendation you received and one detail you learned.',
    script: '“Quick question—you seem like you’d have a good answer. What’s one ___ you’d recommend?”',
  },
  {
    id: 'voice-note',
    title: 'Use your real voice',
    prompt: 'Send a 20–40 second voice note to a friend you normally only text.',
    why: 'Letting your voice be heard is a small, controllable exposure to being more present.',
    category: 'connection',
    difficulty: 2,
    minutes: 7,
    proofHint: 'Upload your own draft or describe what you shared. Never upload someone else’s private message.',
    boundaryTags: ['voice-message', 'direct-message'],
  },
  {
    id: 'small-preference',
    title: 'State a preference',
    prompt: 'When a small choice appears today, say what you actually prefer instead of “anything is fine.”',
    why: 'Confidence grows when you practice taking up a reasonable amount of space.',
    category: 'assertiveness',
    difficulty: 2,
    minutes: 3,
    proofHint: 'Describe the choice, your preference, and what happened next.',
  },
  {
    id: 'three-questions',
    title: 'Go one question deeper',
    prompt: 'Have a conversation where you ask three genuine follow-up questions instead of planning your next answer.',
    why: 'Curiosity takes pressure off performance and makes connection easier.',
    category: 'conversation',
    difficulty: 2,
    minutes: 12,
    proofHint: 'List the three questions, with identifying details removed.',
  },
  {
    id: 'invite-light',
    title: 'Make the light invite',
    prompt: 'Invite someone to a low-pressure activity: coffee, a walk, lunch, a game, or studying together.',
    why: 'Clear invitations teach you that a “no” is information, not a verdict on you.',
    category: 'connection',
    difficulty: 3,
    minutes: 10,
    proofHint: 'Share the invitation you sent. Crop or cover names and avatars.',
    script: '“I’m planning to ___ this week. Want to join? No worries if your week is packed.”',
    boundaryTags: ['invitation', 'direct-message'],
  },
  {
    id: 'kind-boundary',
    title: 'Use a kind no',
    prompt: 'Decline one small request or suggestion you do not want, kindly and without inventing an excuse.',
    why: 'Healthy boundaries reduce resentment and build trust in your own judgment.',
    category: 'assertiveness',
    difficulty: 3,
    minutes: 5,
    proofHint: 'Write the boundary in your own words and rate the discomfort from 1–10.',
    script: '“Thanks for thinking of me. I’m going to pass this time.”',
  },
  {
    id: 'honest-appreciation',
    title: 'Name what they mean',
    prompt: 'Tell someone you trust one concrete way they have made your life better.',
    why: 'Direct appreciation is vulnerable, useful, and safer than dramatic declarations.',
    category: 'connection',
    difficulty: 3,
    minutes: 12,
    proofHint: 'Share what you chose to express and how it felt. Their response stays private.',
    boundaryTags: ['vulnerability'],
  },
]

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
