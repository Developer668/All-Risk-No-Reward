import type { ProofAssessment } from '../types'
import { callRemoteRpc, invokeRemote, isInsforgeConfigured } from './insforge'

export interface ProofSubmission {
  assignmentId: string
  note: string
  proofName?: string
  imageDataUrl?: string
  backendMode?: 'local' | 'insforge'
}

export interface ProofResult extends ProofAssessment {
  pointsAwarded: number
  completion?: unknown
  assignment?: unknown
  profile?: unknown
  recovery?: unknown
}

function localAssessment(note: string, hasImage: boolean): ProofResult {
  const normalized = note.trim()
  const words = normalized.split(/\s+/).filter(Boolean)
  const concreteSignals = /\b(said|asked|sent|told|gave|complimented|greeted|invited|declined|answered|spoke|called|introduced|shared|responded)\b/i.test(normalized) ? 16 : 0
  const reflectionSignals = /\b(felt|nervous|awkward|uncomfortable|learned|next time|response|reacted)\b/i.test(normalized) ? 10 : 0
  const score = Math.min(96, 12 + Math.min(42, words.length * 2) + concreteSignals + reflectionSignals + (hasImage ? 18 : 0))

  if (score >= 72) {
    return {
      score,
      verdict: 'complete',
      feedback: 'This includes a concrete action and enough detail to count. Nice follow-through.',
      pointsAwarded: 120,
    }
  }
  if (score >= 25) {
    return {
      score,
      verdict: 'partial',
      feedback: 'Your progress counts. Add one more observable detail next time for full credit.',
      pointsAwarded: 60,
    }
  }
  return {
    score,
    verdict: 'needs-more',
    feedback: 'Add what you actually said or did. One specific action is enough; names are not needed.',
    pointsAwarded: 0,
  }
}

export async function assessProof(submission: ProofSubmission): Promise<ProofResult> {
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
      imageDataUrl: submission.imageDataUrl,
    })
  }

  await new Promise((resolve) => window.setTimeout(resolve, 650))
  return localAssessment(submission.note, Boolean(submission.imageDataUrl || submission.proofName))
}
