import { ChangeEvent, useEffect, useState } from 'react'
import { ArrowRight, Flame, ImagePlus, LockKeyhole, Sparkles } from 'lucide-react'
import type { Challenge, DailyAssignment } from '../types'
import { preparePrivateProofImage } from '../services/imageProof'
import { assessProof, type ProofResult } from '../services/proof'
import { Modal } from './Modal'

interface ProofDialogProps {
  open: boolean
  assignment: DailyAssignment
  challenge: Challenge
  backendMode: 'local' | 'insforge'
  onClose: () => void
  onRecorded: (result: ProofResult, note: string, proofName?: string) => Promise<void>
}

export function ProofDialog({ open, assignment, challenge, backendMode, onClose, onRecorded }: ProofDialogProps) {
  const [note, setNote] = useState('')
  const [file, setFile] = useState<File>()
  const [preview, setPreview] = useState<string>()
  const [imageDataUrl, setImageDataUrl] = useState<string>()
  const [assessment, setAssessment] = useState<ProofResult>()
  const [busy, setBusy] = useState(false)
  const [imageBusy, setImageBusy] = useState(false)
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setNote('')
    setFile(undefined)
    setPreview(undefined)
    setImageDataUrl(undefined)
    setAssessment(undefined)
    setConsent(false)
    setError('')
  }, [open, assignment.id])

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0]
    setError('')
    if (!next) return
    setImageBusy(true)
    try {
      if (preview) URL.revokeObjectURL(preview)
      setFile(next)
      setPreview(URL.createObjectURL(next))
      setImageDataUrl(await preparePrivateProofImage(next))
    } catch (caught) {
      setFile(undefined)
      setPreview(undefined)
      setImageDataUrl(undefined)
      setError(caught instanceof Error ? caught.message : 'Could not prepare that image.')
    } finally { setImageBusy(false) }
  }

  async function evaluate() {
    setBusy(true)
    setError('')
    try {
      const result = await assessProof({
        assignmentId: assignment.id,
        note,
        proofName: file?.name,
        imageDataUrl,
        backendMode,
      })
      await onRecorded(result, note, file?.name)
      setAssessment(result)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'We could not check this proof. Your note is still here—try again.')
    } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="proof-title" className="proof-modal">
      {!assessment ? <>
        <div className="section-kicker">PRIVATE PROOF CHECK</div>
        <h2 id="proof-title">Show what happened.</h2>
        <p>{challenge.proofHint}</p>
        <label className="proof-upload">
          {preview ? <img src={preview} alt="Selected proof preview" /> : <><ImagePlus aria-hidden="true" /><strong>{imageBusy ? 'Removing metadata and resizing…' : 'Add an optional image'}</strong><span>Crop names and identifying details first</span></>}
          <input type="file" aria-label="Choose optional proof image" accept="image/png,image/jpeg,image/webp" onChange={(event) => void pickFile(event)} disabled={imageBusy || busy} />
        </label>
        <label className="field">What did you do?<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="I said… I asked… The uncomfortable part was…" rows={5} maxLength={4000} /></label>
        <div className="privacy-note"><LockKeyhole size={17} aria-hidden="true" /> Don’t include names, faces, contact details, or another person’s private reply.</div>
        {backendMode === 'insforge' && <label className="check-row proof-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I understand this note and compressed image will be sent to NVIDIA for this automated assessment.</span></label>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button--accent button--full" onClick={() => void evaluate()} disabled={busy || imageBusy || note.trim().length < 12 || (backendMode === 'insforge' && !consent)}>{busy ? 'Checking concrete details…' : 'Check and record my proof'} <Sparkles size={18} aria-hidden="true" /></button>
      </> : <div className="assessment">
        <div className={`score-ring score-ring--${assessment.verdict}`}><strong>{assessment.score}</strong><span>PROOF SCORE</span></div>
        <p className="section-kicker">{assessment.verdict === 'complete' ? 'CHALLENGE COMPLETE' : assessment.verdict === 'partial' ? 'PROGRESS RECORDED' : 'MORE DETAIL NEEDED'}</p>
        <h2 id="proof-title">{assessment.verdict === 'complete' ? 'You did the brave thing.' : assessment.verdict === 'partial' ? 'You moved forward.' : 'The attempt still matters.'}</h2>
        <p>{assessment.feedback}</p>
        <div className="assessment__xp">+{assessment.pointsAwarded} courage points <Flame size={18} aria-hidden="true" /></div>
        <button className="button button--ink button--full" onClick={onClose}>View today’s log <ArrowRight size={18} aria-hidden="true" /></button>
      </div>}
    </Modal>
  )
}
