import type { ProofAssessment } from '../types'
import type { PreparedVideoFrame } from './imageProof'
import { callRemoteRpc, invokeRemote, isInsforgeConfigured } from './insforge'

export interface ProofSubmission {
  assignmentId: string
  note: string
  proofName?: string
  mediaDataUrl?: string
  videoFrames?: PreparedVideoFrame[]
  videoDurationSeconds?: number
  mediaKind?: 'image' | 'video'
  backendMode?: 'local' | 'insforge'
}

export interface ProofResult extends ProofAssessment {
  pointsAwarded: number
  provider?: 'openai' | 'google-gemini' | 'openrouter' | 'nvidia-nim' | 'on-device-preview'
  model?: string
  mediaKind?: 'image' | 'video'
  criteriaChecked?: number
  completion?: unknown
  assignment?: unknown
  profile?: unknown
  recovery?: unknown
}

function localAssessment(note: string, mediaKind?: 'image' | 'video'): ProofResult {
  const normalized = note.trim()
  const words = normalized.split(/\s+/).filter(Boolean)
  const concreteSignals = /\b(said|asked|sent|told|gave|built|created|made|cooked|walked|ran|completed|recorded|designed|wrote|tested|practiced|performed|organized|photographed|shared|responded)\b/i.test(normalized) ? 16 : 0
  const reflectionSignals = /\b(felt|nervous|awkward|uncomfortable|learned|result|finished|next time|response|reacted)\b/i.test(normalized) ? 10 : 0
  const score = Math.min(96, 12 + Math.min(42, words.length * 2) + concreteSignals + reflectionSignals + (mediaKind ? 18 : 0))

  if (score >= 72) {
    return {
      score,
      verdict: 'complete',
      feedback: 'This includes a concrete action and enough detail to count. Nice follow-through.',
      pointsAwarded: 120,
      provider: 'on-device-preview',
      mediaKind,
    }
  }
  if (score >= 25) {
    return {
      score,
      verdict: 'partial',
      feedback: 'Your progress counts. Add one more observable detail next time for full credit.',
      pointsAwarded: 60,
      provider: 'on-device-preview',
      mediaKind,
    }
  }
  return {
    score,
    verdict: 'needs-more',
    feedback: 'Add what you actually said or did. One specific action is enough; names are not needed.',
    pointsAwarded: 0,
    provider: 'on-device-preview',
    mediaKind,
  }
}

export async function assessProof(submission: ProofSubmission): Promise<ProofResult> {
  if (!submission.mediaDataUrl && !submission.videoFrames?.length) throw new Error('Upload a proof video or image before submitting.')
  const useRemote = submission.backendMode
    ? submission.backendMode === 'insforge'
    : isInsforgeConfigured

  if (useRemote) {
    // Consent is collected immediately beside the submission control. Persist it
    // before reserving a server-side verification attempt.
    await callRemoteRpc('update_profile_preferences', { p_proof_ai_consent: true })
    return invokeRemote<ProofResult>('verify-proof', {
      assignmentId: submission.assignmentId,
      proofNote: submission.note,
      proofName: submission.proofName,
      mediaDataUrl: submission.mediaDataUrl,
      videoFrames: submission.videoFrames,
      videoDurationSeconds: submission.videoDurationSeconds,
      mediaKind: submission.mediaKind,
    })
  }

  await new Promise((resolve) => window.setTimeout(resolve, 650))
  return localAssessment(submission.note, submission.mediaKind)
}
