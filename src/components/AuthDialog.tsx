import { FormEvent, useEffect, useState } from 'react'
import { ArrowRight, Check, KeyRound, LockKeyhole, Mail, ShieldCheck, Sparkles } from 'lucide-react'
import type { ChallengeBoundaryTag } from '../types'
import { localStore } from '../services/localStore'
import {
  type AppAuthUser,
  type PublicAuthConfig,
  exchangeRemoteResetCode,
  finishRemotePasswordReset,
  getPublicAuthConfig,
  isInsforgeConfigured,
  queueRemoteOnboarding,
  resendRemoteVerification,
  signInRemote,
  signInRemoteWithOAuth,
  signUpRemote,
  startRemotePasswordReset,
  verifyRemoteEmail,
} from '../services/insforge'
import { Modal } from './Modal'

type AuthMode = 'signup' | 'signin' | 'forgot' | 'verify-code' | 'check-email' | 'reset-code' | 'reset-new' | 'reset-sent'

const boundaryOptions: Array<{ tag: ChallengeBoundaryTag; label: string }> = [
  { tag: 'direct-message', label: 'No direct-message challenges' },
  { tag: 'voice-message', label: 'No voice-message challenges' },
  { tag: 'invitation', label: 'No invitation challenges' },
  { tag: 'vulnerability', label: 'No vulnerable-disclosure challenges' },
]

interface AuthDialogProps {
  open: boolean
  initialMode?: 'signup' | 'signin'
  onClose: () => void
  onAuthenticated: (user: AppAuthUser) => void
  onLegal: (page: 'privacy' | 'terms') => void
  initialNotice?: string
}

function localUser(result: Awaited<ReturnType<typeof localStore.signIn>>): AppAuthUser {
  return { id: result.profile.id, email: result.profile.email, name: result.profile.name }
}

export function AuthDialog({ open, initialMode = 'signup', onClose, onAuthenticated, onLegal, initialNotice = '' }: AuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [config, setConfig] = useState<PublicAuthConfig>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [resetToken, setResetToken] = useState('')

  useEffect(() => {
    if (!open) return
    setMode(initialMode)
    setError('')
    setNotice(initialNotice)
    void getPublicAuthConfig().then(setConfig).catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load account settings.'))
  }, [open, initialMode, initialNotice])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    setNotice('')
    try { await action() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Something went wrong. Try again.') }
    finally { setBusy(false) }
  }

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim().toLowerCase()
    const password = String(form.get('password') ?? '')
    const name = String(form.get('name') ?? '').trim()

    await run(async () => {
      if (mode === 'signin') {
        const user = isInsforgeConfigured ? await signInRemote(email, password) : localUser(await localStore.signIn(email, password))
        onAuthenticated(user)
        return
      }

      const adult = form.get('adult') === 'on'
      const accepted = form.get('terms') === 'on'
      if (!adult) throw new Error('Confirm that you are at least 18 years old to continue.')
      if (!accepted) throw new Error('Review and accept the Terms and Privacy Policy to continue.')
      const disabledBoundaryTags = boundaryOptions.filter(({ tag }) => form.get(`boundary-${tag}`) === 'on').map(({ tag }) => tag)

      if (!isInsforgeConfigured) {
        const result = await localStore.signUp(name, email, password)
        localStore.updateSettings({
          disabledBoundaryTags,
          boundaries: boundaryOptions.filter(({ tag }) => disabledBoundaryTags.includes(tag)).map(({ label }) => label.replace(' challenges', '')),
        })
        onAuthenticated(localUser(result))
        return
      }

      if (!config) throw new Error('Account settings are still loading. Try again in a moment.')
      const result = await signUpRemote(name, email, password, config)
      queueRemoteOnboarding({
        email,
        name,
        disabledBoundaryTags,
        boundaries: boundaryOptions
          .filter(({ tag }) => disabledBoundaryTags.includes(tag))
          .map(({ label }) => label.replace(' challenges', '')),
      })
      if (result.requiresVerification) {
        setPendingEmail(email)
        setMode(result.verifyEmailMethod === 'code' ? 'verify-code' : 'check-email')
        return
      }
      if (!result.user) throw new Error('Your account was created, but no session was returned. Sign in to continue.')
      onAuthenticated(result.user)
    })
  }

  async function submitVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const code = String(new FormData(event.currentTarget).get('code') ?? '')
    await run(async () => onAuthenticated(await verifyRemoteEmail(pendingEmail, code)))
  }

  async function submitForgot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim().toLowerCase()
    setPendingEmail(email)
    await run(async () => {
      if (!isInsforgeConfigured) {
        setMode('reset-new')
        return
      }
      if (!config) throw new Error('Account settings are still loading. Try again in a moment.')
      await startRemotePasswordReset(email)
      setMode(config.resetPasswordMethod === 'code' ? 'reset-code' : 'reset-sent')
    })
  }

  async function submitResetCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const code = String(new FormData(event.currentTarget).get('code') ?? '')
    await run(async () => {
      setResetToken(await exchangeRemoteResetCode(pendingEmail, code))
      setMode('reset-new')
    })
  }

  async function submitNewPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const password = String(new FormData(event.currentTarget).get('password') ?? '')
    await run(async () => {
      if (isInsforgeConfigured) {
        await finishRemotePasswordReset(password, resetToken)
      } else {
        await localStore.resetPassword(pendingEmail, password)
      }
      setNotice('Password updated. Sign in with your new password.')
      setMode('signin')
    })
  }

  const title = mode === 'signup' ? 'Make room for brave.' : mode === 'signin' ? 'Welcome back.' : mode.startsWith('reset') || mode === 'forgot' ? 'Reset your password.' : 'Check your email.'

  return (
    <Modal open={open} onClose={onClose} labelledBy="auth-title" className="auth-modal">
      <div className="auth-modal__badge" aria-hidden="true"><ArrowRight /></div>
      <p className="section-kicker">PRIVATE ACCOUNT · YOUR BOUNDARIES</p>
      <h2 id="auth-title">{title}</h2>

      {mode === 'check-email' || mode === 'reset-sent' ? <div className="auth-state">
        <Mail aria-hidden="true" />
        <p>{mode === 'check-email' ? `Open the verification link sent to ${pendingEmail}. Then return here and sign in.` : `Open the password-reset link sent to ${pendingEmail}.`}</p>
        {mode === 'check-email' && <button className="button button--ink button--full" type="button" disabled={busy} onClick={() => void run(async () => { await resendRemoteVerification(pendingEmail); setNotice('A new verification email is on its way.') })}>Resend verification email</button>}
        <button className="auth-switch" type="button" onClick={() => setMode('signin')}>Return to sign in</button>
      </div> : mode === 'verify-code' ? <form onSubmit={submitVerification}>
        <p>Enter the six-digit code sent to <strong>{pendingEmail}</strong>.</p>
        <label>Verification code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus placeholder="123456" /></label>
        <button className="button button--accent button--full" disabled={busy}>{busy ? 'Checking code…' : 'Verify and continue'} <Check size={18} aria-hidden="true" /></button>
      </form> : mode === 'forgot' ? <form onSubmit={submitForgot}>
        <p>{isInsforgeConfigured ? 'We’ll send the reset method configured for your account.' : 'Local mode has no email server. Confirm the account email, then choose a new password on this device.'}</p>
        <label>Email address<input name="email" type="email" autoComplete="email" required autoFocus placeholder="you@example.com" /></label>
        <button className="button button--accent button--full" disabled={busy}>{busy ? 'Checking account…' : isInsforgeConfigured ? 'Send reset instructions' : 'Continue securely'} <ArrowRight size={18} aria-hidden="true" /></button>
        <button className="auth-switch" type="button" onClick={() => setMode('signin')}>Return to sign in</button>
      </form> : mode === 'reset-code' ? <form onSubmit={submitResetCode}>
        <p>Enter the six-digit reset code sent to <strong>{pendingEmail}</strong>.</p>
        <label>Reset code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus placeholder="123456" /></label>
        <button className="button button--accent button--full" disabled={busy}>Continue <ArrowRight size={18} aria-hidden="true" /></button>
      </form> : mode === 'reset-new' ? <form onSubmit={submitNewPassword}>
        <p>Choose a new password with at least {config?.passwordMinLength ?? 8} characters.</p>
        <label>New password<input name="password" type="password" autoComplete="new-password" required minLength={config?.passwordMinLength ?? 8} autoFocus /></label>
        <button className="button button--accent button--full" disabled={busy}>{busy ? 'Updating password…' : 'Update password'} <KeyRound size={18} aria-hidden="true" /></button>
      </form> : <form onSubmit={submitCredentials}>
        <p>{isInsforgeConfigured ? 'Your account syncs challenges and progress across devices.' : 'Local mode works immediately and keeps account data in this browser.'}</p>
        {mode === 'signup' && <label>Your name<input name="name" autoComplete="name" required autoFocus placeholder="Alex" /></label>}
        <label>Email address<input name="email" type="email" autoComplete="email" required autoFocus={mode === 'signin'} placeholder="you@example.com" /></label>
        <label>Password<input name="password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={config?.passwordMinLength ?? 8} placeholder={`At least ${config?.passwordMinLength ?? 8} characters`} /></label>

        {mode === 'signup' && <>
          <fieldset className="boundary-fieldset"><legend>Optional challenge boundaries</legend>{boundaryOptions.map(({ tag, label }) => <label className="check-row" key={tag}><input type="checkbox" name={`boundary-${tag}`} /><span><ShieldCheck size={16} aria-hidden="true" />{label}</span></label>)}</fieldset>
          <label className="check-row"><input type="checkbox" name="adult" required /><span>I confirm I am at least 18 years old.</span></label>
          <label className="check-row"><input type="checkbox" name="terms" required /><span>I accept the <button type="button" onClick={() => onLegal('terms')}>Terms</button> and <button type="button" onClick={() => onLegal('privacy')}>Privacy Policy</button>.</span></label>
        </>}

        <button className="button button--accent button--full" disabled={busy || !config}>{busy ? 'Working…' : mode === 'signup' ? 'Create my private account' : 'Sign in'} <Sparkles size={18} aria-hidden="true" /></button>
        {mode === 'signin' && <button className="auth-switch" type="button" onClick={() => setMode('forgot')}>Forgot your password?</button>}
        {isInsforgeConfigured && mode === 'signin' && config?.oAuthProviders.map((provider) => <button key={provider} className="button button--outline button--full" type="button" onClick={() => void run(() => signInRemoteWithOAuth(provider))}>Continue with {provider}</button>)}
      </form>}

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-notice" role="status">{notice}</p>}
      {(mode === 'signup' || mode === 'signin') && <button className="auth-switch" type="button" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>{mode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>}
      <div className="privacy-note"><LockKeyhole size={17} aria-hidden="true" /> We never post, message, or contact another person for you.</div>
    </Modal>
  )
}
