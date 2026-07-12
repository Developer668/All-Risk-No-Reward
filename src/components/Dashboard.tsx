import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight, Award, BarChart3, Bell, CalendarDays, Check, ChevronRight, CircleCheckBig, Clock3,
  Dices, Download, Flag, Flame, Gift, History, Inbox, Laugh, LifeBuoy, LockKeyhole, Medal,
  Menu, Package, RefreshCw, Route, Settings, ShieldCheck, Sparkles, Star, Share2, Target, Trash2,
  Trophy, Users, X, Zap,
} from 'lucide-react'
import type {
  ChallengeBoundaryTag, ChallengeCategory, ChallengeReportReason, DailyView, Difficulty, HistoryEntry,
  NotificationRecord, Profile, UserSettings,
} from '../types'
import type { ProofResult } from '../services/proof'
import {
  completeBonusChallenge, loadBonusState, markChallengeStarted, rollFastFinishBonus, spendLifeline, taskForBonus,
  type BonusRecord, type BonusState,
} from '../services/bonusChallenge'
import { notificationPermission, notificationsSupported, requestNotificationPermission, sendTestNotification } from '../services/notifications'
import { Brand } from './Brand'
import { Modal } from './Modal'
import { ProofDialog } from './ProofDialog'
import { ReportDialog } from './ReportDialog'
import { ShareDialog } from './ShareDialog'

export type AppSection = 'today' | 'journey' | 'milestones' | 'settings'

interface DashboardProps {
  profile: Profile
  daily: DailyView
  history: HistoryEntry[]
  notifications: NotificationRecord[]
  settings: UserSettings
  backendMode: 'local' | 'insforge'
  onRefresh: () => Promise<void>
  onRecordProof: (result: ProofResult, note: string, proofName?: string) => Promise<void>
  onCompleteRecovery: (recoveryId: string, note: string) => Promise<void>
  onRerollRecovery: (recoveryId: string) => Promise<void>
  onReport: (reason: ChallengeReportReason, details: string) => Promise<void>
  onUpdateSettings: (patch: Partial<UserSettings>) => Promise<void>
  onMarkNotification: (id: string) => Promise<void>
  onMarkAllNotifications: () => Promise<void>
  onExportData: () => Promise<string>
  onDeleteData: () => Promise<void>
  onSignOut: () => Promise<void>
}

const boundaryOptions: Array<{ tag: ChallengeBoundaryTag; label: string }> = [
  { tag: 'direct-message', label: 'Direct messages' },
  { tag: 'voice-message', label: 'Voice messages' },
  { tag: 'invitation', label: 'Invitations' },
  { tag: 'vulnerability', label: 'Vulnerable disclosures' },
  { tag: 'requires-consent', label: 'Activities involving other people' },
  { tag: 'group-activity', label: 'Group activities' },
  { tag: 'social-platform', label: 'Social platforms' },
  { tag: 'physical-activity', label: 'Physical activities' },
]

const categoryOptions: Array<{ category: ChallengeCategory; label: string }> = [
  { category: 'coding', label: 'Coding' },
  { category: 'comedy', label: 'Comedy' },
  { category: 'cooking', label: 'Cooking' },
  { category: 'creative', label: 'Creative' },
  { category: 'fitness', label: 'Fitness' },
  { category: 'kindness', label: 'Kindness' },
  { category: 'outdoors', label: 'Outdoors' },
  { category: 'productivity', label: 'Productivity' },
  { category: 'skill', label: 'Skill building' },
  { category: 'social', label: 'Social' },
  { category: 'wellness', label: 'Wellness' },
]

const challengeCategoryLabels = Object.fromEntries(
  categoryOptions.map(({ category, label }) => [category, label]),
) as Partial<Record<ChallengeCategory, string>>

function formatMode(mode?: string, participants = 1) {
  if (mode === 'group') return `Group · about ${participants}`
  if (mode === 'solo_with_other_people') return 'Social · with others'
  return 'Solo-friendly'
}

function formatIntensity(value?: string) {
  if (!value) return 'Flexible intensity'
  return value.replaceAll('_', ' ').replace('none to ', '').replace('optional and scalable', 'scalable')
}

function formatDate(date = new Date()) {
  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()
}

function formatTime(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function timeUntil(value?: string, now = new Date()) {
  if (!value) return ''
  const minutes = Math.max(0, Math.ceil((new Date(value).getTime() - now.getTime()) / 60_000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <div className="empty-state"><Sparkles aria-hidden="true" /><h2>{title}</h2><p>{body}</p></div>
}

function ActiveChallengeCard({ daily, onProof, onReport }: { daily: DailyView; onProof: () => void; onReport: () => void }) {
  const challenge = daily.challenge!
  const participantTarget = challenge.participants?.targetTotal ?? 1
  const facts = [
    challenge.requiresConsent ? <span key="consent"><ShieldCheck aria-hidden="true" /> Consent required</span> : null,
    challenge.equipment?.length ? <span key="equipment"><Package aria-hidden="true" /> {challenge.equipment.join(', ')}</span> : null,
    challenge.timeWindow === '1_day' ? <span key="window"><CalendarDays aria-hidden="true" /> Finish today</span> : null,
  ].filter(Boolean)
  return <>
    <article className="active-challenge">
      <div className="active-challenge__rail"><span>TODAY</span><span className="vertical">DAILY COURAGE</span><span>PRIVATE</span></div>
      <div className="active-challenge__body">
        <div className="active-challenge__meta"><span><Star fill="currentColor" aria-hidden="true" /> LEVEL {challenge.difficulty}</span><span>{challengeCategoryLabels[challenge.category] ?? challenge.category}</span></div>
        <div className="active-challenge__icon"><Target aria-hidden="true" /></div>
        <p className="challenge-card__label">TODAY’S CHALLENGE</p>
        <h2>{challenge.title}</h2>
        <p className="active-challenge__prompt">{challenge.prompt}</p>
        <div className="challenge-facts" aria-label="Challenge requirements">
          <span><Users aria-hidden="true" /> {formatMode(challenge.mode, participantTarget)}</span>
          <span><Zap aria-hidden="true" /> {formatIntensity(challenge.intensity)}</span>
          {facts}
        </div>
        {challenge.script && <div className="script"><span>OPTIONAL WORDING</span> “{challenge.script.replaceAll('“', '').replaceAll('”', '')}”</div>}
        <div className="why"><Sparkles aria-hidden="true" /><div><strong>Why this works</strong><p>{challenge.why}</p></div></div>
        <div className="active-challenge__footer"><span><Clock3 aria-hidden="true" /> ABOUT {challenge.minutes} MIN</span><span><Zap aria-hidden="true" /> UP TO 120 POINTS</span></div>
      </div>
    </article>
    <div className="challenge-actions">
      <button className="button button--accent" onClick={onProof}>Add privacy-safe proof <ArrowRight aria-hidden="true" /></button>
      <button className="text-button" onClick={onReport}><Flag aria-hidden="true" /> Flag or replace this challenge</button>
    </div>
  </>
}

function LockedCard({ daily, now, onEnableNotifications }: { daily: DailyView; now: Date; onEnableNotifications: () => void }) {
  return <article className="locked-card">
    <div className="locked-card__dial"><LockKeyhole aria-hidden="true" /><span>{timeUntil(daily.unlockAt, now)}</span></div>
    <p className="section-kicker">TODAY’S CARD IS SEALED</p>
    <h2>Surprise interrupts avoidance.</h2>
    <p>Your private challenge unlocks at <strong>{formatTime(daily.unlockAt)}</strong>. You’ll still have until {formatTime(daily.deadlineAt)} to make an attempt.</p>
    <button className="button button--ink" disabled={!notificationsSupported()} onClick={onEnableNotifications}><Bell aria-hidden="true" /> {notificationsSupported() ? 'Enable unlock notification' : 'Browser notifications unavailable'}</button>
  </article>
}

function CompletionCard({ daily, onShare }: { daily: DailyView; onShare: () => void }) {
  const completion = daily.completion
  const complete = daily.status === 'completed' || completion?.verdict === 'complete'
  return <article className={`complete-card ${complete ? '' : 'complete-card--partial'}`}>
    <div className="complete-card__stamp">{complete ? <Check aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}</div>
    <span className="section-kicker">{complete ? 'CHALLENGE COMPLETE' : 'PARTIAL PROGRESS SAVED'}</span>
    <h2>{complete ? <>Brave, specific,<br /><i>and done.</i></> : <>The attempt<br /><i>still counts.</i></>}</h2>
    <p>{complete ? 'That was one repetition of choosing connection over avoidance.' : 'Your proof earned partial credit. Close the recovery loop below to unlock your next card.'}</p>
    <div className="complete-card__points">+{completion?.pointsAwarded ?? 0}<small>COURAGE POINTS</small></div>
    <button type="button" className="button button--outline complete-card__share" onClick={onShare}><Share2 aria-hidden="true" /> Share this {complete ? 'win' : 'attempt'}</button>
  </article>
}

function BonusChallengeCard({ record, onOpen }: { record?: BonusRecord; onOpen: () => void }) {
  if (!record) return null
  const pending = record.status === 'offered'
  return <button type="button" className={`bonus-callout ${pending ? '' : 'bonus-callout--resolved'}`} onClick={onOpen}>
    <span>{pending ? <Gift aria-hidden="true" /> : record.status === 'won-lifeline' ? <LifeBuoy aria-hidden="true" /> : <Laugh aria-hidden="true" />}</span>
    <span><strong>{pending ? 'Bonus challenge waiting' : record.status === 'won-lifeline' ? 'Lifeline banked' : 'The game chose chaos'}</strong><small>{pending ? 'You finished suspiciously fast. Take the extra round.' : 'Tap to see your bonus result.'}</small></span>
    <ChevronRight aria-hidden="true" />
  </button>
}

function BonusChallengeDialog({ open, record, lifelines, onClose, onComplete }: {
  open: boolean
  record?: BonusRecord
  lifelines: number
  onClose: () => void
  onComplete: () => void
}) {
  const task = taskForBonus(record)
  if (!record || !task) return null
  const pending = record.status === 'offered'
  return <Modal open={open} onClose={onClose} labelledBy="bonus-title" className="bonus-modal">
    {pending ? <>
      <div className="bonus-modal__icon"><Gift aria-hidden="true" /></div>
      <p className="section-kicker">SPEED CHECK · BONUS ROUND</p>
      <h2 id="bonus-title">Too fast. Suspicious.</h2>
      <p>You crushed the main challenge before the clock expected it, so the game dealt you one more.</p>
      <div className="bonus-task"><span>OPTIONAL CHAOS</span><h3>{task.title}</h3><p>{task.prompt}</p></div>
      <p className="bonus-modal__odds">Finish it, then flip for either a lifeline or—very scientifically—absolutely nothing.</p>
      <button type="button" className="button button--accent button--full" onClick={onComplete}>I did it — reveal my reward <Sparkles aria-hidden="true" /></button>
    </> : record.status === 'won-lifeline' ? <div className="bonus-result">
      <div className="bonus-result__mark bonus-result__mark--win"><LifeBuoy aria-hidden="true" /></div>
      <p className="section-kicker">LUCKY FLIP</p>
      <h2 id="bonus-title">Lifeline unlocked.</h2>
      <p>You can erase one future recovery task. You now have <strong>{lifelines} {lifelines === 1 ? 'lifeline' : 'lifelines'}</strong> banked.</p>
      <button type="button" className="button button--ink button--full" onClick={onClose}>Bank it <Check aria-hidden="true" /></button>
    </div> : <div className="bonus-result">
      <div className="bonus-result__mark bonus-result__mark--nothing"><Laugh aria-hidden="true" /></div>
      <p className="section-kicker">THE GAME IS MESSING WITH YOU</p>
      <h2 id="bonus-title">HAHA. You get nothing this time.</h2>
      <p>Joke’s on you. The bonus challenge still counts as a brave rep, but the reward machine says: absolutely zilch.</p>
      <button type="button" className="button button--ink button--full" onClick={onClose}>Rude. Continue anyway <ArrowRight aria-hidden="true" /></button>
    </div>}
  </Modal>
}

function RecoveryCard({ daily, onComplete, onReroll, onUseLifeline, lifelines, diceEnabled }: {
  daily: DailyView
  onComplete: (note: string) => Promise<void>
  onReroll: () => Promise<void>
  onUseLifeline: () => Promise<void>
  lifelines: number
  diceEnabled: boolean
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [error, setError] = useState('')
  const [rollNotice, setRollNotice] = useState('')
  const recovery = daily.recovery!
  const task = daily.recoveryTask!
  const rollsRemaining = daily.recoveryRerollsRemaining ?? Math.max(0, 2 - (recovery.rerollCount ?? 0))
  const rollStatus = daily.recoveryRerollStatus ?? (rollsRemaining > 0 ? 'available' : 'limit-reached')

  async function rollDice() {
    setRolling(true)
    setError('')
    setRollNotice('')
    try {
      await onReroll()
      setNote('')
      setRollNotice('The dice picked a new punishment. This roll cannot be undone.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The dice could not be rolled.')
    } finally {
      setRolling(false)
    }
  }

  return <article className="recovery-card">
    <div className="recovery-card__level"><span>LEVEL</span><strong>{recovery.severity}</strong></div>
    <div>
      <p className="section-kicker">PRIVATE RECOVERY · NO SHAME</p>
      <h2>{task.title}</h2>
      <p>{task.prompt}</p>
      <div className="recovery-card__meta"><span><Clock3 aria-hidden="true" /> {task.minutes} min</span><span><LockKeyhole aria-hidden="true" /> private</span><span><ShieldCheck aria-hidden="true" /> reviewed catalog</span></div>
      {diceEnabled && <div className="recovery-dice">
        <div><Dices className={rolling ? 'recovery-dice__rolling' : ''} aria-hidden="true" /><span><strong>Gamble this punishment</strong><small>A roll can get easier or harder. You will never see a repeat.</small></span></div>
        <button
          type="button"
          className="button button--ink recovery-dice__button"
          disabled={busy || rolling || rollStatus !== 'available'}
          onClick={() => void rollDice()}
          aria-label={rollStatus === 'available' ? `Roll the punishment dice, ${rollsRemaining} ${rollsRemaining === 1 ? 'roll' : 'rolls'} remaining` : 'Punishment dice locked'}
        >
          <Dices aria-hidden="true" />
          {rolling ? 'Rolling…' : rollStatus === 'limit-reached' ? 'Result locked' : rollStatus === 'catalog-exhausted' ? 'No unseen punishments' : `Roll dice · ${rollsRemaining} left`}
        </button>
      </div>}
      {rollNotice && <p className="form-notice recovery-dice__notice" role="status">{rollNotice}</p>}
      {lifelines > 0 && <div className="lifeline-card"><LifeBuoy aria-hidden="true" /><span><strong>Use a lifeline</strong><small>Clear this recovery instantly. You have {lifelines} banked.</small></span><button type="button" className="button button--outline" disabled={busy || rolling} onClick={() => { setBusy(true); setError(''); void onUseLifeline().catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not use that lifeline.')).finally(() => setBusy(false)) }}>Use lifeline</button></div>}
      <label className="field">Private reflection <span className="field-hint">12 characters minimum</span><textarea rows={3} minLength={12} maxLength={1000} required value={note} onChange={(event) => setNote(event.target.value)} placeholder="What did you do, and what will you try next?" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button--accent" disabled={busy || note.trim().length < 12} onClick={() => { setBusy(true); setError(''); void onComplete(note.trim()).catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not close the recovery loop.')).finally(() => setBusy(false)) }}>{busy ? 'Closing the loop…' : 'I completed this recovery'} <Check aria-hidden="true" /></button>
    </div>
  </article>
}

function TodayPanel({ daily, bonusRecord, lifelines, onOpenBonus, onProof, onReport, onShare, onCompleteRecovery, onRerollRecovery, onUseLifeline, diceEnabled, onEnableNotifications, now }: {
  daily: DailyView; bonusRecord?: BonusRecord; lifelines: number; onOpenBonus: () => void; onProof: () => void; onReport: () => void; onShare: () => void; onCompleteRecovery: (note: string) => Promise<void>; onRerollRecovery: () => Promise<void>; onUseLifeline: () => Promise<void>; diceEnabled: boolean; onEnableNotifications: () => void; now: Date
}) {
  const hasRecovery = Boolean(daily.recovery && daily.recoveryTask)
  return <div className="main-column">
    <div className="today-heading"><div><span className="section-kicker">YOUR DAILY DROP</span><h2>{daily.status === 'locked' ? 'A little suspense.' : hasRecovery ? 'Close the loop.' : daily.status === 'completed' ? 'Filed under: brave.' : 'The card is yours.'}</h2></div>{daily.deadlineAt && <div className="deadline"><Clock3 aria-hidden="true" /><span>PROOF DUE<strong>{formatTime(daily.deadlineAt)}</strong></span></div>}</div>
    {daily.status === 'locked' ? <LockedCard daily={daily} now={now} onEnableNotifications={onEnableNotifications} />
      : hasRecovery ? <><CompletionCard daily={daily} onShare={onShare} /><RecoveryCard daily={daily} onComplete={onCompleteRecovery} onReroll={onRerollRecovery} onUseLifeline={onUseLifeline} lifelines={lifelines} diceEnabled={diceEnabled} /></>
      : daily.status === 'available' && daily.challenge ? <ActiveChallengeCard daily={daily} onProof={onProof} onReport={onReport} />
      : daily.status === 'completed' || daily.status === 'partial' ? <><CompletionCard daily={daily} onShare={onShare} /><BonusChallengeCard record={bonusRecord} onOpen={onOpenBonus} /></>
      : <EmptyState title="No challenge is available." body="Your boundaries filtered the catalog or today’s deadline has passed. Review Settings, then refresh." />}
  </div>
}

function JourneyPanel({ history }: { history: HistoryEntry[] }) {
  if (!history.length) return <EmptyState title="Your journey starts today." body="Completed and missed challenges will appear here with their private scores and recovery status." />
  const attempted = history.filter((entry) => ['completed', 'partial', 'missed'].includes(entry.assignment.status))
  const completed = attempted.filter((entry) => entry.assignment.status === 'completed').length
  const scored = attempted.filter((entry) => entry.completion)
  const averageScore = scored.length ? Math.round(scored.reduce((total, entry) => total + (entry.completion?.score ?? 0), 0) / scored.length) : 0
  const categories = new Set(attempted.map((entry) => entry.challenge?.category).filter(Boolean)).size

  return <div className="journey-layout">
    <section className="journey-overview" aria-label="Journey summary">
      <div><Route aria-hidden="true" /><span><strong>{attempted.length}</strong>Total attempts</span></div>
      <div><CircleCheckBig aria-hidden="true" /><span><strong>{attempted.length ? Math.round(completed / attempted.length * 100) : 0}%</strong>Completion rate</span></div>
      <div><BarChart3 aria-hidden="true" /><span><strong>{averageScore || '—'}</strong>Average proof score</span></div>
      <div><Sparkles aria-hidden="true" /><span><strong>{categories}</strong>Categories explored</span></div>
    </section>
    <section className="content-panel">
      <div className="panel-heading"><div><span className="section-kicker">YOUR PRIVATE LOG</span><h2>Every attempt tells the story.</h2></div><History aria-hidden="true" /></div>
      <div className="history-list">{history.map(({ assignment, challenge, completion, recovery }, index) => {
        const status = assignment.status === 'completed' ? 'Completed' : assignment.status === 'partial' ? 'Partial progress' : assignment.status === 'missed' ? 'Missed' : assignment.status
        return <article key={assignment.id} className="history-row history-row--rich">
          <div className="history-row__marker"><span>{history.length - index}</span><i /></div>
          <time><strong>{new Date(`${assignment.dateKey}T12:00:00`).toLocaleDateString([], { day: '2-digit' })}</strong>{new Date(`${assignment.dateKey}T12:00:00`).toLocaleDateString([], { month: 'short' })}</time>
          <div className="history-row__main"><div className="history-row__tags"><span>{challenge ? challengeCategoryLabels[challenge.category] : 'Archived'}</span>{challenge && <span>Level {challenge.difficulty}</span>}</div><h3>{challenge?.title ?? 'Challenge unavailable'}</h3><p>{status}{completion?.pointsAwarded ? ` · +${completion.pointsAwarded} points` : ''}</p></div>
          <div className="history-row__score">{completion ? <><strong>{completion.score}</strong><span>score</span></> : <span>—</span>}</div>
          <div className="history-row__outcome"><span className={`status-chip status-chip--${assignment.status}`}>{status}</span>{recovery && <small>Recovery {recovery.status}</small>}</div>
        </article>
      })}</div>
    </section>
  </div>
}

function MilestonesPanel({ profile, history }: { profile: Profile; history: HistoryEntry[] }) {
  const completed = history.filter((entry) => entry.assignment.status === 'completed').length
  const partial = history.filter((entry) => entry.assignment.status === 'partial').length
  const attempts = history.filter((entry) => ['completed', 'partial', 'missed'].includes(entry.assignment.status)).length
  const categories = new Set(history
    .filter((entry) => ['completed', 'partial', 'missed'].includes(entry.assignment.status))
    .map((entry) => entry.challenge?.category)
    .filter(Boolean)).size
  const nextLevel = profile.level * 500
  const levelStart = (profile.level - 1) * 500
  const progress = Math.min(100, ((profile.couragePoints - levelStart) / Math.max(1, nextLevel - levelStart)) * 100)
  const achievements = [
    { title: 'First Spark', description: 'Record your first real attempt.', value: attempts, target: 1, icon: Sparkles },
    { title: 'Three for Three', description: 'Complete three full challenges.', value: completed, target: 3, icon: CircleCheckBig },
    { title: 'Week of Nerve', description: 'Build a seven-day completion streak.', value: profile.streak, target: 7, icon: Flame },
    { title: 'Range Finder', description: 'Explore six challenge categories.', value: categories, target: 6, icon: Route },
    { title: 'Point Collector', description: 'Earn 1,000 courage points.', value: profile.couragePoints, target: 1_000, icon: Medal },
    { title: 'Twenty Strong', description: 'Complete twenty full challenges.', value: completed, target: 20, icon: Trophy },
  ]
  const earned = achievements.filter((achievement) => achievement.value >= achievement.target).length

  return <div className="milestones-layout">
    <section className="content-panel milestone-summary">
      <div className="panel-heading"><div><span className="section-kicker">MILESTONES</span><h2>Your courage has receipts.</h2></div><Trophy aria-hidden="true" /></div>
      <div className="milestone-hero"><div className="level-card__orbit"><span>{profile.level}</span></div><div><p>CURRENT LEVEL</p><h3>{profile.level < 2 ? 'Beginner' : profile.level < 4 ? 'Explorer' : 'Pathfinder'}</h3><span>{profile.couragePoints} courage points · {earned} badges earned</span></div></div>
      <div className="milestone-progress"><div><span>Level {profile.level + 1}</span><strong>{Math.max(0, nextLevel - profile.couragePoints)} points to go</strong></div><div className="progress-bar" role="progressbar" aria-label="Progress to next level" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress}%` }} /></div></div>
      <div className="stat-strip stat-strip--four"><div><strong>{completed}</strong><span>Full challenges</span></div><div><strong>{partial}</strong><span>Partial attempts</span></div><div><strong>{profile.streak}</strong><span>Current streak</span></div><div><strong>{categories}</strong><span>Categories tried</span></div></div>
    </section>
    <section className="achievement-section"><div className="achievement-heading"><div><span className="section-kicker">BADGE BOARD</span><h3>Next stops on the map.</h3></div><Award aria-hidden="true" /></div><div className="achievement-grid">{achievements.map(({ title, description, value, target, icon: Icon }) => {
      const unlocked = value >= target
      const badgeProgress = Math.min(100, value / target * 100)
      return <article className={`achievement-card ${unlocked ? 'achievement-card--earned' : ''}`} key={title}><div className="achievement-card__icon">{unlocked ? <Check aria-hidden="true" /> : <Icon aria-hidden="true" />}</div><span>{unlocked ? 'EARNED' : `${Math.min(value, target)} / ${target}`}</span><h4>{title}</h4><p>{description}</p><div className="achievement-card__bar"><i style={{ width: `${badgeProgress}%` }} /></div></article>
    })}</div></section>
  </div>
}

function SettingsPanel({ settings, backendMode, onSave, onExport, onDelete, onSignOut }: {
  settings: UserSettings; backendMode: 'local' | 'insforge'; onSave: (patch: Partial<UserSettings>) => Promise<void>; onExport: () => Promise<string>; onDelete: () => Promise<void>; onSignOut: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [deleteText, setDeleteText] = useState('')

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    const form = new FormData(event.currentTarget)
    try {
      const disabledBoundaryTags = boundaryOptions.filter(({ tag }) => form.get(`boundary-${tag}`) === 'on').map(({ tag }) => tag)
      const disabledCategories = categoryOptions.filter(({ category }) => form.get(`category-${category}`) === 'on').map(({ category }) => category)
      const notificationsEnabled = form.get('notifications') === 'on'
      await onSave({
        unlockWindowStart: String(form.get('unlockStart')),
        unlockWindowEnd: String(form.get('unlockEnd')),
        deadlineTime: String(form.get('deadline')),
        morningReminderTime: String(form.get('morningTime')),
        maxDifficulty: Number(form.get('maxDifficulty')) as Difficulty,
        notificationsEnabled,
        morningReminderEnabled: form.get('morning') === 'on',
        unlockReminderEnabled: form.get('unlockReminder') === 'on',
        deadlineReminderEnabled: form.get('deadlineReminder') === 'on',
        disabledCategories,
        disabledBoundaryTags,
        boundaries: boundaryOptions.filter(({ tag }) => disabledBoundaryTags.includes(tag)).map(({ label }) => `No ${label.toLowerCase()}`),
      })
      let permission = notificationPermission()
      if (notificationsEnabled && permission === 'default') permission = await requestNotificationPermission()
      setMessage(permission === 'denied'
        ? 'Settings saved. Browser alerts are blocked in browser settings; your private in-app inbox still works.'
        : 'Settings saved. Today’s existing card keeps its original schedule.')
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Could not save settings.') }
    finally { setBusy(false) }
  }

  async function exportData() {
    setBusy(true); setMessage('')
    try {
      const json = await onExport()
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `all-risk-export-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      setMessage('Your private export is ready.')
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Could not export your data.') }
    finally { setBusy(false) }
  }

  async function deleteData() {
    setBusy(true); setMessage('')
    try { await onDelete() }
    catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Could not delete your data.'); setBusy(false) }
  }

  return <section className="content-panel">
    <div className="panel-heading"><div><span className="section-kicker">SETTINGS & SAFETY</span><h2>Keep the challenge yours.</h2></div><Settings aria-hidden="true" /></div>
    <form className="settings-form" onSubmit={save}>
      <fieldset><legend>Daily schedule</legend><div className="settings-grid">
        <label className="field">Unlock window starts<input type="time" name="unlockStart" defaultValue={settings.unlockWindowStart} required /></label>
        <label className="field">Unlock window ends<input type="time" name="unlockEnd" defaultValue={settings.unlockWindowEnd} required /></label>
        <label className="field">Proof deadline<input type="time" name="deadline" defaultValue={settings.deadlineTime} required /></label>
        <label className="field">Morning heads-up<input type="time" name="morningTime" defaultValue={settings.morningReminderTime} required /></label>
        <label className="field">Maximum difficulty<select name="maxDifficulty" defaultValue={settings.maxDifficulty}>{[1,2,3,4,5].map((level) => <option value={level} key={level}>Level {level}</option>)}</select></label>
      </div></fieldset>
      <fieldset><legend>Challenge boundaries</legend><p>Checked formats or categories will never be assigned.</p>
        <div className="settings-check-grid">
          <div><strong>Formats</strong>{boundaryOptions.map(({ tag, label }) => <label className="check-row" key={tag}><input type="checkbox" name={`boundary-${tag}`} defaultChecked={settings.disabledBoundaryTags.includes(tag)} /><span>{label}</span></label>)}</div>
          <div><strong>Categories</strong>{categoryOptions.map(({ category, label }) => <label className="check-row" key={category}><input type="checkbox" name={`category-${category}`} defaultChecked={settings.disabledCategories.includes(category)} /><span>{label}</span></label>)}</div>
        </div>
      </fieldset>
      <fieldset><legend>Notifications</legend>
        <label className="check-row"><input type="checkbox" name="notifications" defaultChecked={settings.notificationsEnabled} /><span>Enable the private notification inbox</span></label>
        <label className="check-row"><input type="checkbox" name="morning" defaultChecked={settings.morningReminderEnabled} /><span>Morning heads-up</span></label>
        <label className="check-row"><input type="checkbox" name="unlockReminder" defaultChecked={settings.unlockReminderEnabled} /><span>Challenge-unlocked alert</span></label>
        <label className="check-row"><input type="checkbox" name="deadlineReminder" defaultChecked={settings.deadlineReminderEnabled} /><span>One-hour deadline alert</span></label>
        <p className="settings-help">Browser alerts need permission from this browser. The in-app inbox remains available without it.</p>
      </fieldset>
      {message && <p className="form-notice" role="status">{message}</p>}
      <button className="button button--accent" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
    </form>
    <div className="data-controls"><h3>Your data</h3><p>{backendMode === 'local' ? 'Local mode stores data only in this browser.' : 'InsForge mode stores account and challenge records in your connected project.'}</p>
      <div><button type="button" className="button button--outline" disabled={busy} onClick={() => void exportData()}><Download aria-hidden="true" /> Export my data</button><button type="button" className="button button--outline" disabled={busy} onClick={() => void onSignOut()}>Sign out</button></div>
      <label className="field danger-zone">Type DELETE to permanently erase app data<input value={deleteText} onChange={(event) => setDeleteText(event.target.value)} autoComplete="off" /><button type="button" className="button button--danger" disabled={busy || deleteText !== 'DELETE'} onClick={() => void deleteData()}><Trash2 aria-hidden="true" /> Delete my data</button></label>
    </div>
  </section>
}

function NotificationsDialog({ open, records, onClose, onRead, onReadAll }: { open: boolean; records: NotificationRecord[]; onClose: () => void; onRead: (id: string) => Promise<void>; onReadAll: () => Promise<void> }) {
  return <Modal open={open} onClose={onClose} labelledBy="notifications-title" className="notifications-modal"><div className="section-kicker">PRIVATE INBOX</div><h2 id="notifications-title">Notifications.</h2><button className="text-button notifications-read-all" onClick={() => void onReadAll()}>Mark all as read</button><div className="notification-list">{records.length ? [...records].sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map((record) => <button key={record.id} className={record.readAt ? 'notification-row' : 'notification-row notification-row--unread'} onClick={() => void onRead(record.id)}><span>{record.readAt ? <Check aria-hidden="true" /> : <Inbox aria-hidden="true" />}</span><span><strong>{record.title}</strong><small>{record.body}</small><time>{new Date(record.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></span></button>) : <EmptyState title="Your inbox is clear." body="Morning, unlock, deadline, completion, and recovery updates will appear here." />}</div></Modal>
}

export function Dashboard(props: DashboardProps) {
  const [section, setSection] = useState<AppSection>('today')
  const [menuOpen, setMenuOpen] = useState(false)
  const [proofOpen, setProofOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [bonusOpen, setBonusOpen] = useState(false)
  const [bonusState, setBonusState] = useState<BonusState>(() => loadBonusState(props.profile.id, window.localStorage))
  const [bonusRecord, setBonusRecord] = useState<BonusRecord>()
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [now, setNow] = useState(new Date())
  const [compactNavigation, setCompactNavigation] = useState(() => window.matchMedia('(max-width: 900px)').matches)
  const sidebarRef = useRef<HTMLElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const autoOpenedBonusRef = useRef('')
  const { daily, onRefresh } = props
  const bonusEnabled = props.backendMode === 'local'

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    setBonusState(loadBonusState(props.profile.id, window.localStorage))
    setBonusRecord(undefined)
    autoOpenedBonusRef.current = ''
  }, [props.profile.id])
  useEffect(() => {
    if (!bonusEnabled || daily.status !== 'available' || !daily.assignment) return
    setBonusState(markChallengeStarted(props.profile.id, daily.assignment.id, window.localStorage))
  }, [bonusEnabled, daily.assignment, daily.status, props.profile.id])
  useEffect(() => {
    if (!bonusEnabled) {
      setBonusRecord(undefined)
      setBonusOpen(false)
      return
    }
    if (proofOpen) return
    const record = rollFastFinishBonus(props.profile.id, daily, window.localStorage)
    setBonusState(loadBonusState(props.profile.id, window.localStorage))
    setBonusRecord(record)
    if (record?.status === 'offered' && autoOpenedBonusRef.current !== record.assignmentId) {
      autoOpenedBonusRef.current = record.assignmentId
      setBonusOpen(true)
    }
  }, [bonusEnabled, daily, proofOpen, props.profile.id])
  useEffect(() => {
    if (!daily.unlockAt || daily.status !== 'locked') return
    const delay = new Date(daily.unlockAt).getTime() - Date.now()
    if (delay <= 0) void onRefresh()
    else {
      const timer = window.setTimeout(() => void onRefresh(), Math.min(delay + 250, 2_147_000_000))
      return () => window.clearTimeout(timer)
    }
  }, [daily.unlockAt, daily.status, onRefresh])
  useEffect(() => {
    const query = window.matchMedia('(max-width: 900px)')
    const update = () => setCompactNavigation(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    const sidebar = sidebarRef.current
    if (!sidebar) return
    if (compactNavigation && !menuOpen) sidebar.setAttribute('inert', '')
    else sidebar.removeAttribute('inert')
    return () => sidebar.removeAttribute('inert')
  }, [compactNavigation, menuOpen])
  useEffect(() => {
    if (!menuOpen) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [menuOpen])

  const weekDone = useMemo(() => props.history.filter((entry) => ['completed','partial'].includes(entry.assignment.status) && (Date.now() - new Date(`${entry.assignment.dateKey}T12:00:00`).getTime()) < 7 * 86_400_000).length, [props.history])
  const completedCount = useMemo(() => props.history.filter((entry) => entry.assignment.status === 'completed').length, [props.history])
  const unread = props.notifications.filter((record) => !record.readAt).length

  function chooseSection(next: AppSection) { setSection(next); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  async function enableNotifications() {
    if (!notificationsSupported()) return
    const permission = await requestNotificationPermission()
    if (permission === 'granted') { await props.onUpdateSettings({ notificationsEnabled: true }); await sendTestNotification() }
  }
  function finishBonus() {
    const assignmentId = bonusRecord?.assignmentId
    if (!assignmentId) return
    const result = completeBonusChallenge(props.profile.id, assignmentId, window.localStorage)
    setBonusRecord({ ...result.record })
    setBonusState(result.state)
  }
  async function useLifeline() {
    if (!bonusEnabled) throw new Error('Bonus lifelines are available in on-device mode.')
    if (!props.daily.recovery) throw new Error('That recovery task is no longer open.')
    await props.onCompleteRecovery(props.daily.recovery.id, 'Cleared with a bonus challenge lifeline.')
    setBonusState(spendLifeline(props.profile.id, window.localStorage))
  }

  return <div className="app-shell">
    <aside ref={sidebarRef} className={`sidebar ${menuOpen ? 'sidebar--open' : ''}`} aria-label="Application navigation" aria-hidden={compactNavigation && !menuOpen ? true : undefined}>
      <div className="sidebar__head"><Brand light /><button className="icon-button sidebar__close" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><X aria-hidden="true" /></button></div>
      <nav>{([['today', Target, 'Today'],['journey', History, 'My journey'],['milestones', Trophy, 'Milestones'],['settings', Settings, 'Settings']] as const).map(([id, Icon, label]) => <button key={id} className={section === id ? 'active' : ''} onClick={() => chooseSection(id)}><Icon aria-hidden="true" /> {label}{id === 'today' && unread > 0 && <span>{unread}</span>}</button>)}</nav>
      <div className="sidebar__principle"><ShieldCheck aria-hidden="true" /><strong>Agency is the rule.</strong><p>Resize or report anything that crosses a boundary.</p></div>
      <button className="sidebar__profile" onClick={() => chooseSection('settings')}><span>{props.profile.name.slice(0,2).toUpperCase()}</span><span><strong>{props.profile.name}</strong><small>Level {props.profile.level} · {props.backendMode === 'local' ? 'On this device' : 'Synced'}</small></span><ChevronRight aria-hidden="true" /></button>
    </aside>
    {compactNavigation && menuOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => { setMenuOpen(false); menuButtonRef.current?.focus() }} />}

    <main className="dashboard">
      <header className="app-header"><button ref={menuButtonRef} className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu aria-hidden="true" /></button><div><p>{formatDate(now)}</p><h1>{section === 'today' ? `Good ${now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening'}, ${props.profile.name.split(' ')[0]}.` : section === 'journey' ? 'Your journey.' : section === 'milestones' ? 'Your milestones.' : 'Your settings.'}</h1></div><div className="app-header__actions"><button className="icon-button notification" onClick={() => setNotificationsOpen(true)} aria-label={`Open notifications${unread ? `, ${unread} unread` : ''}`}><Bell aria-hidden="true" />{unread > 0 && <span />}</button><div className="streak-pill"><Flame fill="currentColor" aria-hidden="true" /> <strong>{props.profile.streak}</strong> day streak</div></div></header>

      {section === 'today' ? <section className="dashboard-grid"><TodayPanel daily={props.daily} bonusRecord={bonusEnabled ? bonusRecord : undefined} lifelines={bonusEnabled ? bonusState.lifelines : 0} onOpenBonus={() => setBonusOpen(true)} onProof={() => setProofOpen(true)} onReport={() => setReportOpen(true)} onShare={() => setShareOpen(true)} onCompleteRecovery={(note) => props.onCompleteRecovery(props.daily.recovery!.id, note)} onRerollRecovery={() => props.onRerollRecovery(props.daily.recovery!.id)} onUseLifeline={useLifeline} diceEnabled onEnableNotifications={() => void enableNotifications()} now={now} /><aside className="right-column">{bonusEnabled && bonusState.lifelines > 0 && <article className="lifeline-balance"><LifeBuoy aria-hidden="true" /><div><span>LIFELINES</span><strong>{bonusState.lifelines} banked</strong></div></article>}<article className="profile-stats-card"><div className="card-heading"><span>YOUR REAL PROGRESS</span><button className="icon-button" onClick={() => chooseSection('milestones')} aria-label="View milestones"><ChevronRight aria-hidden="true" /></button></div><div className="profile-stats-grid"><div><strong>{props.profile.level}</strong><span>Level</span></div><div><strong>{completedCount}</strong><span>Completed</span></div><div><strong>{props.profile.streak}</strong><span>Day streak</span></div><div><strong>{props.profile.couragePoints}</strong><span>Points</span></div></div></article><article className="progress-card"><div className="card-heading"><span>THIS WEEK</span><strong>{weekDone} / 7</strong></div><div className="progress-bar" role="progressbar" aria-label="Weekly attempts" aria-valuemin={0} aria-valuemax={7} aria-valuenow={weekDone}><i style={{ width: `${Math.min(100, weekDone / 7 * 100)}%` }} /></div><p><strong>{Math.max(0, 7-weekDone)} more</strong> attempts to fill the week.</p></article><article className="boundaries-card"><div className="card-heading"><span>YOUR BOUNDARIES</span><ShieldCheck aria-hidden="true" /></div><p>{props.settings.disabledBoundaryTags.length ? `${props.settings.disabledBoundaryTags.length} challenge filters are active.` : 'All safe challenge categories are available.'}</p><div className="tag-list">{props.settings.boundaries.map((boundary) => <span key={boundary}>{boundary}</span>)}</div><button onClick={() => chooseSection('settings')}>Review safety settings <ChevronRight aria-hidden="true" /></button></article><blockquote>“Confidence isn’t knowing they’ll like you. It’s knowing you’ll be okay if they don’t.”<cite>— TODAY’S FIELD NOTE</cite></blockquote></aside></section>
        : <div className="dashboard-content">{section === 'journey' ? <JourneyPanel history={props.history} /> : section === 'milestones' ? <MilestonesPanel profile={props.profile} history={props.history} /> : <SettingsPanel settings={props.settings} backendMode={props.backendMode} onSave={props.onUpdateSettings} onExport={props.onExportData} onDelete={props.onDeleteData} onSignOut={props.onSignOut} />}</div>}
    </main>

    <nav className="mobile-bottom-nav" aria-label="Mobile application navigation"><button className={section === 'today' ? 'active' : ''} onClick={() => chooseSection('today')}><Target aria-hidden="true" />Today</button><button className={section === 'journey' ? 'active' : ''} onClick={() => chooseSection('journey')}><CalendarDays aria-hidden="true" />Journey</button><button className={section === 'milestones' ? 'active' : ''} onClick={() => chooseSection('milestones')}><Trophy aria-hidden="true" />Milestones</button><button className={section === 'settings' ? 'active' : ''} onClick={() => chooseSection('settings')}><Settings aria-hidden="true" />Settings</button></nav>
    {props.daily.assignment && props.daily.challenge && <ProofDialog open={proofOpen} assignment={props.daily.assignment} challenge={props.daily.challenge} backendMode={props.backendMode} onClose={() => setProofOpen(false)} onRecorded={props.onRecordProof} />}
    {props.daily.challenge && <ReportDialog open={reportOpen} challengeTitle={props.daily.challenge.title} onClose={() => setReportOpen(false)} onSubmit={props.onReport} />}
    {props.daily.completion && <ShareDialog open={shareOpen} onClose={() => setShareOpen(false)} verdict={props.daily.status === 'completed' || props.daily.completion.verdict === 'complete' ? 'complete' : 'partial'} points={props.daily.completion.pointsAwarded ?? 0} streak={props.profile.streak} challengeTitle={props.daily.challenge?.title} />}
    <BonusChallengeDialog open={bonusOpen} record={bonusRecord} lifelines={bonusState.lifelines} onClose={() => setBonusOpen(false)} onComplete={finishBonus} />
    <NotificationsDialog open={notificationsOpen} records={props.notifications} onClose={() => setNotificationsOpen(false)} onRead={props.onMarkNotification} onReadAll={props.onMarkAllNotifications} />
  </div>
}
