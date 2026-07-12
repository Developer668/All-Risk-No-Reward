import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { ArrowRight, Camera, CheckCircle2, Circle, Flame, Images, LockKeyhole, Sparkles, Square, Trash2, Upload, Video, X } from 'lucide-react'
import type { Challenge, DailyAssignment } from '../types'
import { preparePrivateProofMedia, type PreparedProofMedia } from '../services/imageProof'
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

type RecorderState = 'idle' | 'requesting' | 'ready' | 'recording' | 'finalizing'
type MediaMode = 'images' | 'videos' | 'both'

interface ProofAttachment {
  id: string
  file: File
  preview: string
  prepared: PreparedProofMedia
}

const MAX_RECORDING_SECONDS = 30
const MAX_ATTACHMENTS = 4
const MAX_VIDEO_ATTACHMENTS = 3
const MAX_VISUAL_ITEMS = 18

function needsDenseMotionSampling(challenge: Challenge): boolean {
  const requirements = [challenge.title, challenge.prompt, challenge.proofHint, ...(challenge.successCriteria ?? [])].join(' ')
  return /\b(?:reps?|repetitions?|rounds?|laps?|sets?|times?|seconds?|minutes?|hours?|steps?|push[ -]?ups?|pull[ -]?ups?|squats?|sit[ -]?ups?|burpees?|jumps?|hops?|lunges?|planks?|distance|miles?|kilometers?|metres?|meters?)\b/i.test(requirements)
    || /\b\d{1,5}\b/.test(requirements)
}

function preferredRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=h264,aac',
    'video/mp4',
  ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType))
}

function recordingErrorMessage(caught: unknown): string {
  if (caught instanceof DOMException) {
    if (caught.name === 'NotAllowedError' || caught.name === 'SecurityError') return 'Camera access was blocked. Allow camera access in your browser, then try again.'
    if (caught.name === 'NotFoundError' || caught.name === 'DevicesNotFoundError') return 'No available camera was found on this device.'
    if (caught.name === 'NotReadableError' || caught.name === 'TrackStartError') return 'Your camera is busy in another app. Close that app, then try again.'
  }
  return caught instanceof Error ? caught.message : 'This device could not start a video recording.'
}

export function ProofDialog({ open, assignment, challenge, backendMode, onClose, onRecorded }: ProofDialogProps) {
  const [note, setNote] = useState('')
  const [mediaMode, setMediaMode] = useState<MediaMode>('both')
  const [attachments, setAttachments] = useState<ProofAttachment[]>([])
  const [assessment, setAssessment] = useState<ProofResult>()
  const [busy, setBusy] = useState(false)
  const [mediaBusy, setMediaBusy] = useState(false)
  const [consent, setConsent] = useState(false)
  const [error, setError] = useState('')
  const [recorderOpen, setRecorderOpen] = useState(false)
  const [recorderState, setRecorderState] = useState<RecorderState>('idle')
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const liveVideoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream>()
  const mediaRecorderRef = useRef<MediaRecorder>()
  const recordingChunksRef = useRef<Blob[]>([])
  const recordingFailedRef = useRef(false)
  const recorderRequestIdRef = useRef(0)
  const recordingIntervalRef = useRef<number>()
  const recordingTimeoutRef = useRef<number>()
  const denseMotionSampling = needsDenseMotionSampling(challenge)

  useEffect(() => {
    if (!open) return
    setNote('')
    const accepted = challenge.acceptedEvidence ?? ['image', 'video']
    setMediaMode(accepted.length === 1 ? accepted[0] === 'image' ? 'images' : 'videos' : 'both')
    setAttachments((current) => {
      current.forEach(({ preview }) => URL.revokeObjectURL(preview))
      return []
    })
    setAssessment(undefined)
    setConsent(false)
    setError('')
    setRecorderOpen(false)
    setRecorderState('idle')
    setRecordingSeconds(0)
    return () => {
      recorderRequestIdRef.current += 1
      if (recordingIntervalRef.current) window.clearInterval(recordingIntervalRef.current)
      if (recordingTimeoutRef.current) window.clearTimeout(recordingTimeoutRef.current)
      const recorder = mediaRecorderRef.current
      if (recorder) {
        recorder.ondataavailable = null
        recorder.onstop = null
        recorder.onerror = null
        if (recorder.state !== 'inactive') recorder.stop()
      }
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = undefined
      mediaRecorderRef.current = undefined
      recordingChunksRef.current = []
    }
  }, [open, assignment.id, challenge.acceptedEvidence])

  useEffect(() => {
    if (open) return
    setAttachments((current) => {
      current.forEach(({ preview }) => URL.revokeObjectURL(preview))
      return []
    })
  }, [open])

  useEffect(() => {
    if (!recorderOpen || !liveVideoRef.current) return
    liveVideoRef.current.srcObject = streamRef.current ?? null
  }, [recorderOpen, recorderState])

  async function addFiles(files: File[]) {
    setError('')
    if (!files.length) return
    const openSlots = MAX_ATTACHMENTS - attachments.length
    if (openSlots <= 0) {
      setError(`You can attach up to ${MAX_ATTACHMENTS} images or videos.`)
      return
    }
    const selected = files.slice(0, openSlots)
    const videoCount = attachments.filter(({ prepared }) => prepared.kind === 'video').length + selected.filter((file) => file.type.startsWith('video/')).length
    if (videoCount > MAX_VIDEO_ATTACHMENTS) {
      setError(`You can attach up to ${MAX_VIDEO_ATTACHMENTS} videos in one proof.`)
      return
    }
    setMediaBusy(true)
    const nextAttachments: ProofAttachment[] = []
    try {
      for (const file of selected) {
        const prepared = await preparePrivateProofMedia(file, { videoFrameCount: denseMotionSampling ? 6 : 3 })
        nextAttachments.push({ id: `${file.name}:${file.size}:${file.lastModified}:${crypto.randomUUID()}`, file, preview: URL.createObjectURL(file), prepared })
      }
      const visualItems = [...attachments, ...nextAttachments].reduce((total, item) => total + (item.prepared.kind === 'video' ? item.prepared.frames.length : 1), 0)
      if (visualItems > MAX_VISUAL_ITEMS) throw new Error('That combination contains too many video frames. Use fewer or shorter videos.')
      setAttachments((current) => [...current, ...nextAttachments])
      if (files.length > openSlots) setError(`Only the first ${openSlots} files were added. The limit is ${MAX_ATTACHMENTS}.`)
    } catch (caught) {
      nextAttachments.forEach(({ preview }) => URL.revokeObjectURL(preview))
      setError(caught instanceof Error ? caught.message : 'Could not prepare those photos or videos.')
    } finally { setMediaBusy(false) }
  }

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const next = [...(event.target.files ?? [])]
    event.target.value = ''
    await addFiles(next)
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const removed = current.find((item) => item.id === id)
      if (removed) URL.revokeObjectURL(removed.preview)
      return current.filter((item) => item.id !== id)
    })
  }

  function stopCameraTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = undefined
  }

  function clearRecordingTimers() {
    if (recordingIntervalRef.current) window.clearInterval(recordingIntervalRef.current)
    if (recordingTimeoutRef.current) window.clearTimeout(recordingTimeoutRef.current)
    recordingIntervalRef.current = undefined
    recordingTimeoutRef.current = undefined
  }

  function closeRecorder() {
    recorderRequestIdRef.current += 1
    clearRecordingTimers()
    stopCameraTracks()
    mediaRecorderRef.current = undefined
    recordingChunksRef.current = []
    setRecorderOpen(false)
    setRecorderState('idle')
    setRecordingSeconds(0)
  }

  async function openRecorder() {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('In-browser recording is not supported here. You can still record with your camera app and choose the video using Upload.')
      return
    }

    setRecorderOpen(true)
    setRecorderState('requesting')
    setRecordingSeconds(0)
    const requestId = recorderRequestIdRef.current + 1
    recorderRequestIdRef.current = requestId
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      if (recorderRequestIdRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      setRecorderState('ready')
    } catch (caught) {
      closeRecorder()
      setError(recordingErrorMessage(caught))
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') return
    setRecorderState('finalizing')
    clearRecordingTimers()
    recorder.stop()
  }

  function startRecording() {
    const stream = streamRef.current
    if (!stream) {
      setError('The camera session ended. Open the recorder and try again.')
      closeRecorder()
      return
    }

    setError('')
    recordingChunksRef.current = []
    recordingFailedRef.current = false
    try {
      const mimeType = preferredRecordingMimeType()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 })
        : new MediaRecorder(stream, { videoBitsPerSecond: 2_500_000 })
      mediaRecorderRef.current = recorder
      recorder.ondataavailable = (event) => { if (event.data.size > 0) recordingChunksRef.current.push(event.data) }
      recorder.onerror = () => {
        recordingFailedRef.current = true
        clearRecordingTimers()
        setError('The recording was interrupted. Please try again or upload a video instead.')
      }
      recorder.onstop = () => {
        const outputType = recorder.mimeType || mimeType || 'video/webm'
        const blob = new Blob(recordingChunksRef.current, { type: outputType })
        recordingChunksRef.current = []
        stopCameraTracks()
        if (recordingFailedRef.current || !blob.size) {
          if (!recordingFailedRef.current) setError('The camera did not return a usable video. Please record again or upload one instead.')
          setRecorderOpen(false)
          setRecorderState('idle')
          return
        }
        const extension = outputType.includes('mp4') ? 'mp4' : 'webm'
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const recordedFile = new File([blob], `proof-recording-${timestamp}.${extension}`, { type: outputType })
        void addFiles([recordedFile]).finally(() => {
          mediaRecorderRef.current = undefined
          setRecorderOpen(false)
          setRecorderState('idle')
          setRecordingSeconds(0)
        })
      }
      recorder.start(1_000)
      const startedAt = performance.now()
      setRecorderState('recording')
      setRecordingSeconds(0)
      recordingIntervalRef.current = window.setInterval(() => {
        setRecordingSeconds(Math.min(MAX_RECORDING_SECONDS, Math.floor((performance.now() - startedAt) / 1_000)))
      }, 250)
      recordingTimeoutRef.current = window.setTimeout(() => {
        setRecordingSeconds(MAX_RECORDING_SECONDS)
        stopRecording()
      }, MAX_RECORDING_SECONDS * 1_000)
    } catch (caught) {
      setError(recordingErrorMessage(caught))
      setRecorderState('ready')
    }
  }

  async function evaluate() {
    setBusy(true)
    setError('')
    try {
      const mediaItems = attachments.map(({ file, prepared }) => prepared.kind === 'image'
        ? { kind: 'image' as const, name: file.name, dataUrl: prepared.dataUrl }
        : { kind: 'video' as const, name: file.name, frames: prepared.frames, durationSeconds: prepared.durationSeconds })
      const proofName = attachments.map(({ file }) => file.name).join(', ').slice(0, 255)
      const kinds = new Set(mediaItems.map(({ kind }) => kind))
      const mediaKind = kinds.size > 1 ? 'mixed' as const : mediaItems[0]?.kind
      const result = await assessProof({
        assignmentId: assignment.id,
        note,
        proofName,
        mediaKind,
        mediaItems,
        backendMode,
      })
      await onRecorded(result, note, proofName)
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
        <div className={`verification-mode ${backendMode === 'insforge' ? 'verification-mode--live' : ''}`}><Sparkles aria-hidden="true" /><span><strong>{backendMode === 'insforge' ? 'OpenAI verification is live' : 'Sample review mode'}</strong>{backendMode === 'insforge' ? 'Your selected images and sampled video frames are checked together against the completion criteria.' : 'Demo results stay on this device and are not OpenAI-verified.'}</span></div>
        <div className="proof-media-mode" role="group" aria-label="Accepted attachment types">
          <button type="button" className={mediaMode === 'images' ? 'active' : ''} onClick={() => setMediaMode('images')} disabled={!(challenge.acceptedEvidence ?? ['image','video']).includes('image')}><Images aria-hidden="true" /> Images</button>
          <button type="button" className={mediaMode === 'videos' ? 'active' : ''} onClick={() => setMediaMode('videos')} disabled={!(challenge.acceptedEvidence ?? ['image','video']).includes('video')}><Video aria-hidden="true" /> Videos</button>
          <button type="button" className={mediaMode === 'both' ? 'active' : ''} onClick={() => setMediaMode('both')} disabled={!['image','video'].every((kind) => (challenge.acceptedEvidence ?? ['image','video']).includes(kind as 'image' | 'video'))}><Images aria-hidden="true" /> Both</button>
        </div>
        <div className="proof-source-options" role="group" aria-label="Choose how to add proof">
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={mediaBusy || busy || attachments.length >= MAX_ATTACHMENTS || recorderState === 'recording' || recorderState === 'finalizing'}><Upload aria-hidden="true" /><span><strong>Choose files</strong><small>Add up to {MAX_ATTACHMENTS} attachments</small></span></button>
          <button type="button" className={recorderOpen ? 'active' : ''} onClick={() => void openRecorder()} disabled={mediaMode === 'images' || mediaBusy || busy || recorderOpen || attachments.length >= MAX_ATTACHMENTS}><Camera aria-hidden="true" /><span><strong>Record video</strong><small>Add a camera recording</small></span></button>
        </div>
        <input id="proof-file-input" ref={fileInputRef} className="proof-file-input" type="file" multiple aria-label="Choose proof videos or images" accept={mediaMode === 'images' ? 'image/png,image/jpeg,image/webp' : mediaMode === 'videos' ? 'video/mp4,video/quicktime,video/mov,video/webm' : 'video/mp4,video/quicktime,video/mov,video/webm,image/png,image/jpeg,image/webp'} onChange={(event) => void pickFile(event)} disabled={mediaBusy || busy} />
        {recorderOpen ? <div className={`proof-recorder proof-recorder--${recorderState}`}>
          <div className="proof-recorder__stage">
            <video ref={liveVideoRef} aria-label="Live camera preview" autoPlay muted playsInline />
            <div className="proof-recorder__status" aria-live="polite">
              {recorderState === 'recording' && <span className="proof-recorder__live"><Circle fill="currentColor" aria-hidden="true" /> REC</span>}
              <span>{String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')} / 00:30</span>
            </div>
            {recorderState === 'requesting' && <div className="proof-recorder__message">Waiting for camera permission…</div>}
            {recorderState === 'finalizing' && <div className="proof-recorder__message">Preparing your private recording…</div>}
          </div>
          <div className="proof-recorder__controls">
            {recorderState === 'ready' && <button type="button" className="button button--accent" onClick={startRecording}><Circle fill="currentColor" aria-hidden="true" /> Start recording</button>}
            {recorderState === 'recording' && <button type="button" className="button button--ink" onClick={stopRecording}><Square fill="currentColor" aria-hidden="true" /> Stop &amp; use video</button>}
            {(recorderState === 'ready' || recorderState === 'requesting') && <button type="button" className="proof-recorder__cancel" onClick={closeRecorder}><X aria-hidden="true" /> Cancel</button>}
          </div>
          <p>The camera turns off after you stop. Audio is not recorded. The full recording stays in this browser; only sampled frames are added to this proof.</p>
        </div> : attachments.length ? <div className="proof-attachment-grid" aria-label={`${attachments.length} proof attachments selected`}>
          {attachments.map(({ id, file, preview, prepared }, index) => <article className="proof-attachment" key={id}>
            {prepared.kind === 'video' ? <video src={preview} aria-label={`Proof video ${index + 1}`} controls muted playsInline /> : <img src={preview} alt={`Proof image ${index + 1}`} />}
            <div><span>{prepared.kind === 'video' ? `${prepared.frames.length} FRAMES` : 'IMAGE'}</span><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(1)} MB</small></div>
            <button type="button" onClick={() => removeAttachment(id)} disabled={busy || mediaBusy} aria-label={`Remove ${file.name}`}><Trash2 aria-hidden="true" /></button>
          </article>)}
          {attachments.length < MAX_ATTACHMENTS && <button type="button" className="proof-add-more" onClick={() => fileInputRef.current?.click()} disabled={busy || mediaBusy}><Upload aria-hidden="true" /> Add more</button>}
        </div> : <label className="proof-upload" htmlFor="proof-file-input">
          {mediaMode === 'images' ? <Images aria-hidden="true" /> : <Video aria-hidden="true" />}
          <strong>{mediaBusy ? 'Preparing private media…' : mediaMode === 'images' ? 'Choose one or more proof images' : mediaMode === 'videos' ? 'Choose or record one or more videos' : 'Choose images, videos, or both'}</strong>
          <span>Up to {MAX_ATTACHMENTS} attachments. Videos must be 30 seconds or shorter; only timestamped frames are sent for verification.{denseMotionSampling ? ' Counted and motion-heavy challenges use extra sequence frames; include a visible counter, timer, or result screen when an exact total matters.' : ''}</span>
        </label>}
        {attachments.length > 0 && <div className="proof-file-ready"><CheckCircle2 aria-hidden="true" /><span><strong>{attachments.length} {attachments.length === 1 ? 'attachment' : 'attachments'} ready for {backendMode === 'insforge' ? 'OpenAI' : 'sample review'}</strong>{attachments.filter(({ prepared }) => prepared.kind === 'image').length} images · {attachments.filter(({ prepared }) => prepared.kind === 'video').length} videos</span></div>}
        <label className="field">Optional context<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything the verifier should know about what happened? You can leave this blank." rows={4} maxLength={4000} /></label>
        <div className="privacy-note"><LockKeyhole size={17} aria-hidden="true" /> {challenge.privacyNotes || 'Don’t include names, faces, contact details, or another person’s private reply.'}</div>
        {backendMode === 'insforge' && <label className="check-row proof-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I agree to send these images and sampled video frames—and my optional context—to OpenAI for one private completion check. Full videos are not uploaded.</span></label>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {busy && <div className="verification-progress" role="status" aria-live="polite"><span /><div><strong>{backendMode === 'insforge' ? 'OpenAI is reviewing all attachments…' : 'Reviewing the sample proof…'}</strong><small>Comparing the visible action with {challenge.successCriteria?.length || 1} completion {challenge.successCriteria?.length === 1 ? 'criterion' : 'criteria'}.</small></div></div>}
        <button className="button button--accent button--full" onClick={() => void evaluate()} disabled={busy || mediaBusy || attachments.length === 0 || (backendMode === 'insforge' && !consent)}>{busy ? 'Processing attachments…' : backendMode === 'insforge' ? `Verify ${attachments.length || ''} ${attachments.length === 1 ? 'attachment' : 'attachments'} with OpenAI` : 'Preview proof result'} <Sparkles size={18} aria-hidden="true" /></button>
      </> : <div className="assessment">
        <div className={`score-ring score-ring--${assessment.verdict}`}><strong>{assessment.score}</strong><span>PROOF SCORE</span></div>
        <p className="section-kicker">{assessment.verdict === 'complete' ? 'CHALLENGE COMPLETE' : assessment.verdict === 'partial' ? 'PROGRESS RECORDED' : 'MORE DETAIL NEEDED'}</p>
        <h2 id="proof-title">{assessment.verdict === 'complete' ? 'You did the brave thing.' : assessment.verdict === 'partial' ? 'You moved forward.' : 'The attempt still matters.'}</h2>
        <p>{assessment.feedback}</p>
        {assessment.criteria?.length ? <div className="assessment-breakdown">
          <strong>What the verifier observed</strong>
          <ul>{assessment.criteria.map((item, index) => <li key={`${item.criterion}-${index}`} className={item.met ? 'met' : 'missing'}>{item.met ? <CheckCircle2 aria-hidden="true" /> : <Circle aria-hidden="true" />}<span><b>{item.criterion}</b><small>{item.observation}</small></span></li>)}</ul>
          {assessment.countCheck && !/^(?:none|not applicable|n\/a)$/i.test(assessment.countCheck.required) && <div className={`assessment-count ${assessment.countCheck.reliable ? 'reliable' : 'uncertain'}`}><span>COUNT / MEASUREMENT</span><strong>{assessment.countCheck.required}</strong><small>{assessment.countCheck.observed}</small></div>}
        </div> : null}
        <div className={`verification-receipt ${assessment.provider === 'openai' ? 'verification-receipt--live' : ''}`}><CheckCircle2 aria-hidden="true" /><span><strong>{assessment.provider === 'openai' ? 'Processed by OpenAI' : 'On-device sample result'}</strong>{assessment.provider === 'openai' ? `${assessment.criteriaChecked || challenge.successCriteria?.length || 1} completion criteria checked against the submitted ${assessment.mediaKind === 'video' ? 'video frames' : assessment.mediaKind === 'mixed' ? 'images and video frames' : 'images'}.` : 'Sign in with a synced account for real OpenAI verification.'}</span></div>
        <div className="assessment__xp">+{assessment.pointsAwarded} courage points <Flame size={18} aria-hidden="true" /></div>
        <button className="button button--ink button--full" onClick={onClose}>View today’s log <ArrowRight size={18} aria-hidden="true" /></button>
      </div>}
    </Modal>
  )
}
