import { FormEvent, useState } from 'react'
import { Flag, ShieldCheck } from 'lucide-react'
import type { ChallengeReportReason } from '../types'
import { Modal } from './Modal'

interface ReportDialogProps {
  open: boolean
  challengeTitle: string
  onClose: () => void
  onSubmit: (reason: ChallengeReportReason, details: string) => Promise<void>
}

export function ReportDialog({ open, challengeTitle, onClose, onSubmit }: ReportDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      await onSubmit(String(form.get('reason')) as ChallengeReportReason, String(form.get('details') ?? ''))
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this report. Try again.')
    } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="report-title" className="report-modal">
      <div className="auth-modal__badge" aria-hidden="true"><Flag /></div>
      <p className="section-kicker">SAFETY REPORT</p>
      <h2 id="report-title">Flag this challenge.</h2>
      <p>Reporting “{challengeTitle}” hides it for today. Your report helps keep the catalog appropriate.</p>
      <form onSubmit={submit}>
        <label className="field">What is the problem?<select name="reason" required defaultValue="crosses-boundary">
          <option value="crosses-boundary">It crosses one of my boundaries</option>
          <option value="unsafe">It could be unsafe</option>
          <option value="inappropriate">It feels inappropriate</option>
          <option value="not-accessible">It is not accessible to me</option>
          <option value="other">Something else</option>
        </select></label>
        <label className="field">Optional details<textarea name="details" rows={4} maxLength={1000} placeholder="Tell us what should change. Do not include anyone’s private information." /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button--ink button--full" disabled={busy}>{busy ? 'Saving report…' : 'Save safety report'} <ShieldCheck size={18} aria-hidden="true" /></button>
      </form>
    </Modal>
  )
}
