import { Component, type ErrorInfo, type ReactNode, useCallback, useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react'
import { AuthDialog } from './components/AuthDialog'
import { Dashboard } from './components/Dashboard'
import { Landing } from './components/Landing'
import { LegalPage } from './components/LegalPage'
import { ResetPasswordPage } from './components/ResetPasswordPage'
import type { ChallengeReportReason, UserSettings } from './types'
import { localStore } from './services/localStore'
import {
  applyPendingRemoteOnboarding,
  type AppAuthUser,
  isInsforgeConfigured,
  restoreRemoteSession,
  signOutRemote,
} from './services/insforge'
import {
  type AppSnapshot,
  completeRemoteRecovery,
  deleteRemoteData,
  exportRemoteData,
  loadRemoteSnapshot,
  markAllRemoteNotifications,
  markRemoteNotification,
  reportRemoteChallenge,
  rerollRemoteRecovery,
  updateRemoteSettings,
} from './services/remoteStore'
import { registerAppServiceWorker, scheduleUnlockNotification } from './services/notifications'
import { clearBonusState, loadBonusState, spendProgressTicket } from './services/bonusChallenge'
import type { ProofResult } from './services/proof'
import type { DeveloperChallengeFilters, DeveloperScenario } from './domain/engine'

type BackendMode = 'local' | 'insforge'
type Route = 'home' | 'app' | 'privacy' | 'terms' | 'reset-password' | 'sign-in'

const BACKEND_PREFERENCE_KEY = 'all-risk-no-reward.backend.v1'

function currentRoute(): Route {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  if (path === '/app') return 'app'
  if (path === '/privacy') return 'privacy'
  if (path === '/terms') return 'terms'
  if (path === '/reset-password') return 'reset-password'
  if (path === '/sign-in') return 'sign-in'
  return 'home'
}

function authRedirectNotice() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('insforge_type') !== 'verify_email') return ''
  if (params.get('insforge_status') === 'success') return 'Email verified. Sign in to finish setting up your private account.'
  if (params.get('insforge_status') === 'error') return params.get('insforge_error') || 'That verification link is invalid or expired. Request a new one from sign-up.'
  return ''
}

function localSnapshot(): AppSnapshot {
  let daily = localStore.getDashboard()
  let profile = localStore.getProfile()
  const bonus = loadBonusState(profile.id, window.localStorage)
  if (daily.recovery && bonus.progressTickets > 0) {
    localStore.redeemProgressTicket(daily.recovery.sourceAssignmentId)
    spendProgressTicket(profile.id, window.localStorage)
    profile = localStore.getProfile()
    daily = localStore.getDashboard()
  }
  return {
    profile,
    daily,
    history: localStore.getHistory(),
    notifications: localStore.getNotifications(),
    settings: localStore.getSettings(),
  }
}

function rememberBackend(mode: BackendMode | null) {
  try {
    if (mode) window.localStorage.setItem(BACKEND_PREFERENCE_KEY, mode)
    else window.localStorage.removeItem(BACKEND_PREFERENCE_KEY)
  } catch {
    // Local storage failures are surfaced by the local adapter when data is used.
  }
}

function preferredBackend(): BackendMode | null {
  try {
    const value = window.localStorage.getItem(BACKEND_PREFERENCE_KEY)
    return value === 'local' || value === 'insforge' ? value : null
  } catch {
    return null
  }
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error(error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <main className="fatal-state"><AlertTriangle aria-hidden="true" /><p className="section-kicker">THE APP HIT A SNAG</p><h1>Your progress is still here.</h1><p>Reload the app to reconnect to your saved challenge state.</p><button className="button button--ink" onClick={() => window.location.reload()}><RefreshCw aria-hidden="true" /> Reload safely</button></main>
  }
}

function LoadingScreen() {
  return <main className="loading-screen" aria-live="polite"><div className="loading-mark" aria-hidden="true"><img src="/logo.png" alt="" /></div><p className="section-kicker">PREPARING YOUR PRIVATE CARD</p><span>Checking today’s challenge state…</span></main>
}

function ConnectionState({ message, onRetry, onExit }: { message: string; onRetry: () => void; onExit: () => void }) {
  return <main className="fatal-state"><AlertTriangle aria-hidden="true" /><p className="section-kicker">COULD NOT LOAD YOUR CARD</p><h1>Let’s reconnect.</h1><p>{message}</p><div><button className="button button--accent" onClick={onRetry}><RefreshCw aria-hidden="true" /> Try again</button><button className="button button--outline" onClick={onExit}>Return home <ArrowRight aria-hidden="true" /></button></div></main>
}

function AppContent() {
  const [route, setRoute] = useState<Route>(currentRoute)
  const [authOpen, setAuthOpen] = useState(currentRoute() === 'sign-in')
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signin')
  const [backendMode, setBackendMode] = useState<BackendMode>()
  const [remoteUser, setRemoteUser] = useState<AppAuthUser>()
  const [snapshot, setSnapshot] = useState<AppSnapshot>()
  const [booting, setBooting] = useState(true)
  const [working, setWorking] = useState(false)
  const [loadError, setLoadError] = useState('')

  const navigate = useCallback((next: Route, replace = false) => {
    const path = next === 'home' ? '/' : `/${next}`
    if (replace) window.history.replaceState({}, '', path)
    else window.history.pushState({}, '', path)
    setRoute(next)
    if (next !== 'sign-in') setAuthOpen(false)
    window.scrollTo({ top: 0 })
  }, [])

  const refresh = useCallback(async () => {
    if (!backendMode) return
    const next = backendMode === 'local'
      ? localSnapshot()
      : await loadRemoteSnapshot(remoteUser)
    setSnapshot(next)
    setLoadError('')
  }, [backendMode, remoteUser])

  useEffect(() => {
    const onPopState = () => {
      const next = currentRoute()
      setRoute(next)
      setAuthOpen(next === 'sign-in')
      if (next === 'sign-in') setAuthMode('signin')
    }
    window.addEventListener('popstate', onPopState)
    void registerAppServiceWorker()
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    let active = true
    async function boot() {
      const preference = preferredBackend()
      try {
        if (preference === 'local' || !isInsforgeConfigured) {
          const restored = localStore.restoreSession()
          if (restored && active) {
            setBackendMode('local')
            setSnapshot(localSnapshot())
            if (route === 'home' || route === 'sign-in') navigate('app', true)
            return
          }
        }

        if (isInsforgeConfigured && preference !== 'local') {
          const user = await restoreRemoteSession()
          if (user && active) {
            await applyPendingRemoteOnboarding(user)
            const next = await loadRemoteSnapshot(user)
            if (!active) return
            setRemoteUser(user)
            setBackendMode('insforge')
            setSnapshot(next)
            rememberBackend('insforge')
            if (route === 'home' || route === 'sign-in') navigate('app', true)
            return
          }
        }

        // A local session remains a valid fallback when a hosted backend was
        // configured after the user started the on-device demo.
        const restored = localStore.restoreSession()
        if (restored && active) {
          setBackendMode('local')
          setSnapshot(localSnapshot())
          rememberBackend('local')
          if (route === 'home' || route === 'sign-in') navigate('app', true)
        } else if (route === 'app') {
          navigate('home', true)
        }
      } catch (caught) {
        if (active) setLoadError(caught instanceof Error ? caught.message : 'The saved session could not be restored.')
      } finally {
        if (active) setBooting(false)
      }
    }
    void boot()
    return () => { active = false }
    // Boot exactly once. Navigation and refresh have their own state paths.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!snapshot?.settings.notificationsEnabled || !snapshot.settings.unlockReminderEnabled) return
    if (snapshot.daily.status === 'locked' && snapshot.daily.unlockAt) {
      scheduleUnlockNotification(snapshot.daily.unlockAt)
    }
  }, [snapshot])

  async function startDemo() {
    setWorking(true); setLoadError('')
    try {
      await localStore.ensureDemoSession()
      setRemoteUser(undefined)
      setBackendMode('local')
      setSnapshot(localSnapshot())
      rememberBackend('local')
      navigate('app')
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : 'The on-device demo could not start.')
    } finally { setWorking(false) }
  }

  async function authenticated(user: AppAuthUser) {
    setWorking(true); setLoadError('')
    try {
      if (isInsforgeConfigured) {
        await applyPendingRemoteOnboarding(user)
        setRemoteUser(user)
        setBackendMode('insforge')
        setSnapshot(await loadRemoteSnapshot(user))
        rememberBackend('insforge')
      } else {
        setRemoteUser(undefined)
        setBackendMode('local')
        setSnapshot(localSnapshot())
        rememberBackend('local')
      }
      setAuthOpen(false)
      navigate('app')
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : 'Your account connected, but today’s card could not load.')
    } finally { setWorking(false) }
  }

  async function recordProof(result: ProofResult, note: string, proofName?: string) {
    if (backendMode === 'local' && snapshot?.daily.assignment) {
      localStore.submitCompletion({ assignmentId: snapshot.daily.assignment.id, score: result.score, note, proofName })
    }
    await refresh()
  }

  async function completeRecovery(id: string, note: string) {
    if (backendMode === 'local') {
      localStore.completeRecovery(id, note)
      await refresh()
    } else setSnapshot(await completeRemoteRecovery(id, note))
  }

  async function rerollRecovery(id: string) {
    if (backendMode === 'local') {
      localStore.rerollRecovery(id)
      await refresh()
    } else {
      setSnapshot(await rerollRemoteRecovery(id))
    }
  }

  async function reportChallenge(reason: ChallengeReportReason, details: string) {
    const assignmentId = snapshot?.daily.assignment?.id
    const challengeId = snapshot?.daily.assignment?.challengeId
    if (!assignmentId || !challengeId) throw new Error('Today’s assignment is no longer available. Refresh and try again.')
    if (backendMode === 'local') {
      localStore.reportChallenge({ assignmentId, challengeId, reason, details })
      await refresh()
    } else setSnapshot(await reportRemoteChallenge(assignmentId, reason, details))
  }

  async function updateSettings(patch: Partial<UserSettings>) {
    if (backendMode === 'local') {
      localStore.updateSettings(patch)
      await refresh()
    } else setSnapshot(await updateRemoteSettings(patch, snapshot?.profile))
  }

  async function developerRegenerate(filters: DeveloperChallengeFilters) {
    if (!import.meta.env.DEV || backendMode !== 'local') throw new Error('Developer tools require the local development demo.')
    localStore.developerRegenerateChallenge(filters)
    setSnapshot(localSnapshot())
  }

  async function developerScenario(scenario: DeveloperScenario) {
    if (!import.meta.env.DEV || backendMode !== 'local') throw new Error('Developer tools require the local development demo.')
    localStore.developerApplyScenario(scenario)
    setSnapshot(localSnapshot())
  }

  async function developerResetToday() {
    if (!import.meta.env.DEV || backendMode !== 'local') throw new Error('Developer tools require the local development demo.')
    localStore.developerResetToday()
    setSnapshot(localSnapshot())
  }

  async function markNotification(id: string) {
    if (backendMode === 'local') {
      localStore.markNotificationRead(id)
      await refresh()
    } else setSnapshot(await markRemoteNotification(id))
  }

  async function markAllNotifications() {
    if (backendMode === 'local') {
      localStore.markAllNotificationsRead()
      await refresh()
    } else setSnapshot(await markAllRemoteNotifications())
  }

  async function exportData() {
    if (backendMode !== 'local') return exportRemoteData()
    const localData = localStore.exportData()
    return JSON.stringify({
      ...localData,
      bonus: loadBonusState(localData.profile.id, window.localStorage),
    }, null, 2)
  }

  async function signOut() {
    if (backendMode === 'local') localStore.signOut()
    else await signOutRemote()
    rememberBackend(null)
    setBackendMode(undefined)
    setRemoteUser(undefined)
    setSnapshot(undefined)
    navigate('home')
  }

  async function deleteData() {
    if (backendMode === 'local') {
      clearBonusState(localStore.getProfile().id, window.localStorage)
      localStore.deleteMyData()
    }
    else {
      await deleteRemoteData()
      await signOutRemote()
    }
    rememberBackend(null)
    setBackendMode(undefined)
    setRemoteUser(undefined)
    setSnapshot(undefined)
    navigate('home')
  }

  if (booting || working) return <LoadingScreen />
  if (route === 'privacy' || route === 'terms') return <LegalPage type={route} onBack={() => window.history.length > 1 ? window.history.back() : navigate('home')} />
  if (route === 'reset-password') return <ResetPasswordPage onBack={() => { setAuthMode('signin'); navigate('sign-in') }} />

  if (route === 'app' && loadError && !snapshot) {
    return <ConnectionState message={loadError} onRetry={() => { setBooting(true); window.location.reload() }} onExit={() => { rememberBackend(null); navigate('home') }} />
  }

  if (route === 'app' && snapshot && backendMode) {
    return <>
      <Dashboard
        {...snapshot}
        backendMode={backendMode}
        onRefresh={refresh}
        onRecordProof={recordProof}
        onCompleteRecovery={completeRecovery}
        onRerollRecovery={rerollRecovery}
        onReport={reportChallenge}
        onUpdateSettings={updateSettings}
        onMarkNotification={markNotification}
        onMarkAllNotifications={markAllNotifications}
        onExportData={exportData}
        onDeleteData={deleteData}
        onSignOut={signOut}
        developerTools={import.meta.env.DEV && backendMode === 'local' ? {
          onRegenerate: developerRegenerate,
          onScenario: developerScenario,
          onResetToday: developerResetToday,
        } : undefined}
      />
      {loadError && <div className="app-toast" role="status">{loadError}</div>}
    </>
  }

  return <>
    <Landing
      onStart={() => { setAuthMode('signup'); setAuthOpen(true) }}
      onTry={() => void startDemo()}
      onAuth={() => { setAuthMode('signin'); setAuthOpen(true) }}
      onNavigate={(next) => navigate(next)}
    />
    {loadError && <div className="app-toast app-toast--landing" role="alert">{loadError}</div>}
    <AuthDialog
      open={authOpen || route === 'sign-in'}
      initialMode={authMode}
      onClose={() => { setAuthOpen(false); if (route === 'sign-in') navigate('home', true) }}
      onAuthenticated={(user) => void authenticated(user)}
      onLegal={(next) => navigate(next)}
      initialNotice={authRedirectNotice()}
    />
  </>
}

export default function App() {
  return <AppErrorBoundary><AppContent /></AppErrorBoundary>
}
