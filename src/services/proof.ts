import type { Challenge, ProofAssessment } from '../types'
import { callRemoteRpc, invokeRemote, isInsforgeConfigured } from './insforge'
import { assessWithAiProvider, loadAiProviderSettings, providerRequest } from './aiProvider'

export interface ProofSubmission {
  assignmentId: string
  note: string
  proofName?: string
  mediaDataUrl?: string
  challenge?: Challenge
  backendMode?: 'local' | 'insforge'
}

export interface ProofResult extends ProofAssessment {
  pointsAwarded: number
  completion?: unknown
  assignment?: unknown
  profile?: unknown
  recovery?: unknown
}

function localAssessment(note: string, hasMedia: boolean): ProofResult {
  const normalized = note.trim()
  const words = normalized.split(/\s+/).filter(Boolean)
  const concreteSignals = /\b(said|asked|sent|told|gave|built|created|made|cooked|walked|ran|completed|recorded|designed|wrote|tested|practiced|performed|organized|photographed|shared|responded)\b/i.test(normalized) ? 16 : 0
  const reflectionSignals = /\b(felt|nervous|awkward|uncomfortable|learned|result|finished|next time|response|reacted)\b/i.test(normalized) ? 10 : 0
  const score = Math.min(96, 12 + Math.min(42, words.length * 2) + concreteSignals + reflectionSignals + (hasMedia ? 18 : 0))

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

  const aiSettings = loadAiProviderSettings()

  if (useRemote) {
    // Consent is collected immediately beside the submission control. Persist it
    // before reserving a server-side verification attempt.
    await callRemoteRpc('update_profile_preferences', { p_proof_ai_consent: true })
    return invokeRemote<ProofResult>('verify-proof', {
      assignmentId: submission.assignmentId,
      proofNote: submission.note,
      proofName: submission.proofName,
      mediaDataUrl: submission.mediaDataUrl,
      provider: providerRequest(aiSettings),
    })
  }

  if (aiSettings.apiKey) {
    if (!submission.challenge) throw new Error('The assigned challenge is unavailable for AI verification.')
    const assessment = await assessWithAiProvider({
      settings: aiSettings,
      challenge: submission.challenge,
      note: submission.note,
      mediaDataUrl: submission.mediaDataUrl,
    })
    return {
      ...assessment,
      pointsAwarded: assessment.score >= 72 ? 120 : assessment.score >= 25 ? 60 : 0,
    }
  }

  await new Promise((resolve) => window.setTimeout(resolve, 650))
  return localAssessment(submission.note, Boolean(submission.mediaDataUrl || submission.proofName))
}
