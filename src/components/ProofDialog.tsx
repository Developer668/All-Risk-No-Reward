import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { ArrowRight, Camera, CheckCircle2, Circle, Flame, LockKeyhole, Sparkles, Square, Upload, Video, X } from 'lucide-react'
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

const MAX_RECORDING_SECONDS = 30

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
  const [file, setFile] = useState<File>()
  const [preview, setPreview] = useState<string>()
  const [preparedMedia, setPreparedMedia] = useState<PreparedProofMedia>()
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
  const isVideo = Boolean(file?.type.startsWith('video/'))

  useEffect(() => {
    if (!open) return
    setNote('')
    setFile(undefined)
    setPreview(undefined)
    setPreparedMedia(undefined)
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
  }, [open, assignment.id])

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  useEffect(() => {
    if (!recorderOpen || !liveVideoRef.current) return
    liveVideoRef.current.srcObject = streamRef.current ?? null
  }, [recorderOpen, recorderState])

  async function prepareFile(next: File) {
    setError('')
    setMediaBusy(true)
    setPreparedMedia(undefined)
    try {
      setFile(next)
      setPreview(URL.createObjectURL(next))
      setPreparedMedia(await preparePrivateProofMedia(next))
    } catch (caught) {
      setFile(undefined)
      setPreview(undefined)
      setPreparedMedia(undefined)
      setError(caught instanceof Error ? caught.message : 'Could not prepare that photo or video.')
    } finally { setMediaBusy(false) }
  }

  async function pickFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0]
    event.target.value = ''
    if (!next) return
    await prepareFile(next)
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
        void prepareFile(recordedFile).finally(() => {
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
      const result = await assessProof({
        assignmentId: assignment.id,
        note,
        proofName: file?.name,
        mediaKind: preparedMedia?.kind,
        mediaDataUrl: preparedMedia?.kind === 'image' ? preparedMedia.dataUrl : undefined,
        videoFrames: preparedMedia?.kind === 'video' ? preparedMedia.frames : undefined,
        videoDurationSeconds: preparedMedia?.kind === 'video' ? preparedMedia.durationSeconds : undefined,
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
        <div className={`verification-mode ${backendMode === 'insforge' ? 'verification-mode--live' : ''}`}><Sparkles aria-hidden="true" /><span><strong>{backendMode === 'insforge' ? 'OpenAI verification is live' : 'Sample review mode'}</strong>{backendMode === 'insforge' ? 'Sampled video frames are checked against this challenge’s completion criteria.' : 'Demo results stay on this device and are not OpenAI-verified.'}</span></div>
        <div className="proof-source-options" role="group" aria-label="Choose how to add proof">
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={mediaBusy || busy || recorderState === 'recording' || recorderState === 'finalizing'}><Upload aria-hidden="true" /><span><strong>Upload</strong><small>Choose an existing file</small></span></button>
          <button type="button" className={recorderOpen ? 'active' : ''} onClick={() => void openRecorder()} disabled={mediaBusy || busy || recorderOpen}><Camera aria-hidden="true" /><span><strong>Record</strong><small>Use this device</small></span></button>
        </div>
        <input id="proof-file-input" ref={fileInputRef} className="proof-file-input" type="file" aria-label="Choose proof video or image" accept="video/mp4,video/quicktime,video/mov,video/webm,image/png,image/jpeg,image/webp" onChange={(event) => void pickFile(event)} disabled={mediaBusy || busy} />
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
          <p>The camera turns off after you stop. Audio is not recorded. The full recording stays in this browser; only sampled frames are used for verification.</p>
        </div> : <label className="proof-upload" htmlFor="proof-file-input">
          {preview
            ? isVideo
              ? <video src={preview} aria-label="Selected proof video preview" controls muted playsInline />
              : <img src={preview} alt="Selected proof preview" />
            : <><Video aria-hidden="true" /><strong>{mediaBusy ? 'Sampling private video frames…' : 'Upload or record your proof video'}</strong><span>Best: 5–30 seconds, MP4/MOV/WebM, under 80 MB. Six timestamped frames are sent for verification; the full video stays in your browser.</span></>}
        </label>}
        {file && preparedMedia && <div className="proof-file-ready"><CheckCircle2 aria-hidden="true" /><span><strong>{isVideo ? `${preparedMedia.kind === 'video' ? preparedMedia.frames.length : 1} video frames ready for OpenAI` : 'Image ready for OpenAI'}</strong>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</span></div>}
        <label className="field">Optional context<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Anything the verifier should know about what happened? You can leave this blank." rows={4} maxLength={4000} /></label>
        <div className="privacy-note"><LockKeyhole size={17} aria-hidden="true" /> {challenge.privacyNotes || 'Don’t include names, faces, contact details, or another person’s private reply.'}</div>
        {backendMode === 'insforge' && <label className="check-row proof-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span>I agree to send sampled video frames or this image—and my optional context—to OpenAI for one private completion check. The full video is not uploaded.</span></label>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {busy && <div className="verification-progress" role="status" aria-live="polite"><span /><div><strong>{backendMode === 'insforge' ? 'OpenAI is reviewing the sampled frames…' : 'Reviewing the sample proof…'}</strong><small>Comparing the visible action with {challenge.successCriteria?.length || 1} completion {challenge.successCriteria?.length === 1 ? 'criterion' : 'criteria'}.</small></div></div>}
        <button className="button button--accent button--full" onClick={() => void evaluate()} disabled={busy || mediaBusy || !preparedMedia || (backendMode === 'insforge' && !consent)}>{busy ? 'Processing video…' : backendMode === 'insforge' ? 'Verify video with OpenAI' : 'Preview proof result'} <Sparkles size={18} aria-hidden="true" /></button>
      </> : <div className="assessment">
        <div className={`score-ring score-ring--${assessment.verdict}`}><strong>{assessment.score}</strong><span>PROOF SCORE</span></div>
        <p className="section-kicker">{assessment.verdict === 'complete' ? 'CHALLENGE COMPLETE' : assessment.verdict === 'partial' ? 'PROGRESS RECORDED' : 'MORE DETAIL NEEDED'}</p>
        <h2 id="proof-title">{assessment.verdict === 'complete' ? 'You did the brave thing.' : assessment.verdict === 'partial' ? 'You moved forward.' : 'The attempt still matters.'}</h2>
        <p>{assessment.feedback}</p>
        <div className={`verification-receipt ${assessment.provider === 'openai' ? 'verification-receipt--live' : ''}`}><CheckCircle2 aria-hidden="true" /><span><strong>{assessment.provider === 'openai' ? 'Processed by OpenAI' : 'On-device sample result'}</strong>{assessment.provider === 'openai' ? `${assessment.criteriaChecked || challenge.successCriteria?.length || 1} completion criteria checked against the ${assessment.mediaKind === 'video' ? 'sampled video frames' : 'image'}.` : 'Sign in with a synced account for real OpenAI verification.'}</span></div>
        <div className="assessment__xp">+{assessment.pointsAwarded} courage points <Flame size={18} aria-hidden="true" /></div>
        <button className="button button--ink button--full" onClick={onClose}>View today’s log <ArrowRight size={18} aria-hidden="true" /></button>
      </div>}
    </Modal>
  )
}
