import { FormEvent, useState } from 'react'
import { ArrowLeft, KeyRound } from 'lucide-react'
import { finishRemotePasswordReset } from '../services/insforge'
import { Brand } from './Brand'

export function ResetPasswordPage({ onBack }: { onBack: () => void }) {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token') ?? ''
  const ready = params.get('insforge_status') === 'ready' && Boolean(token)
  const redirectError = params.get('insforge_error')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(redirectError ?? '')
  const [complete, setComplete] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const password = String(data.get('password') ?? '')
    const confirmation = String(data.get('confirmation') ?? '')
    if (password !== confirmation) { setError('The two passwords do not match.'); return }
    setBusy(true); setError('')
    try { await finishRemotePasswordReset(password, token); setComplete(true); window.history.replaceState({}, '', '/sign-in') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update your password.') }
    finally { setBusy(false) }
  }

  return <main className="auth-page"><header className="legal-header shell"><Brand /><button className="button button--ink button--small" onClick={onBack}><ArrowLeft size={17} aria-hidden="true" /> Back</button></header><section className="auth-page__card">{complete ? <><div className="auth-modal__badge"><KeyRound /></div><p className="section-kicker">PASSWORD UPDATED</p><h1>You’re ready to sign in.</h1><p>Your new password is active.</p><button className="button button--accent" onClick={onBack}>Return to sign in</button></> : ready ? <><p className="section-kicker">SECURE RESET</p><h1>Choose a new password.</h1><form onSubmit={submit}><label className="field">New password<input type="password" name="password" minLength={8} autoComplete="new-password" required autoFocus /></label><label className="field">Confirm new password<input type="password" name="confirmation" minLength={8} autoComplete="new-password" required /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button--accent button--full" disabled={busy}>{busy ? 'Updating password…' : 'Update password'} <KeyRound size={18} aria-hidden="true" /></button></form></> : <><p className="section-kicker">RESET LINK UNAVAILABLE</p><h1>Request a new reset link.</h1><p>{error || 'This link is missing, invalid, or expired. Return to sign in and request another.'}</p><button className="button button--ink" onClick={onBack}>Return to sign in</button></>}</section></main>
}
