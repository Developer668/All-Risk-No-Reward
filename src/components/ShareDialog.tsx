import { useEffect, useMemo, useState } from 'react'
import { Copy, Download, Image as ImageIcon, Share2, ShieldCheck } from 'lucide-react'
import {
  buildShareCaption,
  copyShareCaption,
  createShareCard,
  downloadShareCard,
  supportsNativeImageShare,
  type ShareCardDetails,
  type ShareVerdict,
} from '../services/shareCard'
import { Modal } from './Modal'

interface ShareDialogProps {
  open: boolean
  onClose: () => void
  verdict: ShareVerdict
  points: number
  streak: number
  challengeTitle?: string
}

type ShareAction = 'share' | 'copy' | 'download'

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong while preparing your card.'
}

export function ShareDialog({ open, onClose, verdict, points, streak, challengeTitle }: ShareDialogProps) {
  const [includeChallengeTitle, setIncludeChallengeTitle] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [busy, setBusy] = useState<ShareAction | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const nativeShareAvailable = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const details = useMemo<ShareCardDetails>(() => ({
    verdict,
    points,
    streak,
    challengeTitle,
    includeChallengeTitle,
  }), [challengeTitle, includeChallengeTitle, points, streak, verdict])
  const caption = useMemo(() => buildShareCaption(details), [details])

  useEffect(() => {
    if (!open) return
    setIncludeChallengeTitle(false)
    setStatus('')
    setError('')
  }, [open])

  useEffect(() => {
    if (!open) return
    let active = true
    let objectUrl = ''
    setPreviewUrl('')
    setPreviewError('')

    void createShareCard(details)
      .then(({ blob }) => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setPreviewUrl(objectUrl)
      })
      .catch((caught) => {
        if (active) setPreviewError(errorMessage(caught))
      })

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [details, open])

  function begin(action: ShareAction) {
    setBusy(action)
    setStatus('')
    setError('')
  }

  async function share() {
    begin('share')
    try {
      const artifact = await createShareCard(details)
      if (!supportsNativeImageShare(artifact.file)) {
        throw new Error('This browser cannot attach the image to its share sheet. Download the PNG or copy the caption instead.')
      }
      await navigator.share({
        title: 'All Risk, No Reward',
        text: artifact.caption,
        files: [artifact.file],
      })
      setStatus('Share sheet finished. Posting always stays under your control.')
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') {
        setStatus('Share canceled. Nothing was posted.')
      } else {
        setError(errorMessage(caught))
      }
    } finally {
      setBusy(null)
    }
  }

  async function copy() {
    begin('copy')
    try {
      await copyShareCaption(caption)
      setStatus('Privacy-safe caption copied.')
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(null)
    }
  }

  async function download() {
    begin('download')
    try {
      const artifact = await createShareCard(details)
      downloadShareCard(artifact.blob, verdict)
      setStatus('Your 1200 × 630 PNG is ready.')
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="share-dialog-title" className="share-modal">
      <div className="section-kicker">SHARE BY CHOICE</div>
      <h2 id="share-dialog-title">Make the brave rep visible.</h2>
      <p className="share-modal__lede">A branded field note for your win—not your private proof. Nothing posts until you choose where it goes.</p>

      <div className="share-preview" aria-live="polite" aria-busy={!previewUrl && !previewError}>
        {previewUrl
          ? <img src={previewUrl} alt={`Branded All Risk, No Reward card showing ${verdict === 'complete' ? 'challenge complete' : 'partial progress'}, ${points} courage points, and a ${streak}-day streak${includeChallengeTitle && challengeTitle ? ` for the challenge ${challengeTitle}` : ''}.`} />
          : previewError
            ? <div className="share-preview__fallback"><ImageIcon aria-hidden="true" /><span>Preview unavailable</span></div>
            : <div className="share-preview__loading"><span />Preparing your private preview…</div>}
      </div>
      {previewError && <p className="form-error" role="alert">{previewError}</p>}

      {challengeTitle && (
        <label className="share-title-toggle">
          <input
            type="checkbox"
            checked={includeChallengeTitle}
            onChange={(event) => {
              setIncludeChallengeTitle(event.target.checked)
              setStatus('')
              setError('')
            }}
          />
          <span><strong>Include the challenge title</strong><small>Off by default. Only the catalog title is added—never your proof.</small></span>
        </label>
      )}

      <label className="share-caption">
        <span>PRIVACY-SAFE CAPTION</span>
        <textarea value={caption} readOnly rows={4} aria-label="Privacy-safe sharing caption" />
      </label>

      <div className="share-privacy"><ShieldCheck aria-hidden="true" /><p><strong>Your private details stay private.</strong> The card includes only your result, points, streak, and the optional catalog title. It never includes proof, reflections, contacts, or account details.</p></div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {status && <p className="form-notice" role="status">{status}</p>}

      <div className="share-actions">
        {nativeShareAvailable && <button type="button" className="button button--accent" disabled={busy !== null} onClick={() => void share()}><Share2 aria-hidden="true" /> {busy === 'share' ? 'Opening share sheet…' : 'Share card'}</button>}
        <button type="button" className="button button--outline" disabled={busy !== null} onClick={() => void copy()}><Copy aria-hidden="true" /> {busy === 'copy' ? 'Copying…' : 'Copy caption'}</button>
        <button type="button" className="button button--outline" disabled={busy !== null} onClick={() => void download()}><Download aria-hidden="true" /> {busy === 'download' ? 'Building PNG…' : 'Download PNG'}</button>
      </div>
      {!nativeShareAvailable && <p className="share-modal__support">Your browser does not offer an image share sheet. Download the card or copy its caption—both work everywhere.</p>}
    </Modal>
  )
}
