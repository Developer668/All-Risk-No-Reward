export type ShareVerdict = 'complete' | 'partial'

export interface ShareCardDetails {
  verdict: ShareVerdict
  points: number
  streak: number
  challengeTitle?: string
  includeChallengeTitle: boolean
}

export interface ShareCardArtifact {
  blob: Blob
  file: File
  caption: string
}

const WIDTH = 1200
const HEIGHT = 630

const palette = {
  paper: '#f4efe2',
  cream: '#fbf8ef',
  ink: '#20231f',
  red: '#b53820',
  blue: '#314760',
  yellow: '#efc94a',
} as const

function safeTitle(value?: string) {
  return value?.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 120) ?? ''
}

function normalizedDetails(details: ShareCardDetails) {
  return {
    ...details,
    points: Math.max(0, Math.round(details.points)),
    streak: Math.max(0, Math.round(details.streak)),
    challengeTitle: details.includeChallengeTitle ? safeTitle(details.challengeTitle) : '',
  }
}

export function buildShareCaption(details: ShareCardDetails) {
  const safe = normalizedDetails(details)
  const opening = safe.verdict === 'complete'
    ? 'I showed up for today\u2019s All Risk, No Reward challenge.'
    : 'I made a real attempt at today\u2019s All Risk, No Reward challenge.'
  const title = safe.challengeTitle ? ` Challenge: \u201c${safe.challengeTitle}\u201d.` : ''
  const points = safe.points > 0 ? ` +${safe.points} courage points.` : ''
  const streak = safe.streak > 0 ? ` ${safe.streak}-day courage streak.` : ''

  return `${opening}${title}${points}${streak} One brave rep, on my terms. #AllRiskNoReward`
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (context.measureText(candidate).width <= maxWidth || !current) {
      current = candidate
      continue
    }
    lines.push(current)
    current = word
    if (lines.length === maxLines - 1) break
  }
  if (current && lines.length < maxLines) lines.push(current)

  const consumed = lines.join(' ').split(/\s+/).length
  if (consumed < words.length && lines.length) {
    let finalLine = lines[lines.length - 1]
    while (finalLine && context.measureText(`${finalLine}\u2026`).width > maxWidth) {
      finalLine = finalLine.split(' ').slice(0, -1).join(' ')
    }
    lines[lines.length - 1] = `${finalLine}\u2026`
  }

  lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight))
  return lines.length
}

function drawArrow(context: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  context.save()
  context.translate(x, y)
  context.scale(scale, scale)
  context.strokeStyle = palette.ink
  context.lineWidth = 10
  context.lineCap = 'square'
  context.lineJoin = 'miter'
  context.beginPath()
  context.moveTo(-38, 0)
  context.lineTo(38, 0)
  context.moveTo(12, -26)
  context.lineTo(38, 0)
  context.lineTo(12, 26)
  context.stroke()
  context.restore()
}

function drawShareCard(context: CanvasRenderingContext2D, details: ShareCardDetails) {
  const safe = normalizedDetails(details)
  const complete = safe.verdict === 'complete'

  context.fillStyle = palette.paper
  context.fillRect(0, 0, WIDTH, HEIGHT)

  context.fillStyle = palette.yellow
  context.beginPath()
  context.arc(1035, 78, 184, 0, Math.PI * 2)
  context.fill()

  context.strokeStyle = palette.ink
  context.lineWidth = 3
  context.setLineDash([13, 13])
  context.beginPath()
  context.arc(1035, 78, 214, 0, Math.PI * 2)
  context.stroke()
  context.setLineDash([])

  context.fillStyle = palette.blue
  context.fillRect(0, 0, 210, HEIGHT)
  context.fillStyle = palette.red
  context.fillRect(210, 0, 22, HEIGHT)

  context.save()
  context.translate(98, 530)
  context.rotate(-Math.PI / 2)
  context.fillStyle = palette.cream
  context.font = '800 24px "Bricolage Grotesque Variable", sans-serif'
  context.letterSpacing = '3px'
  context.fillText('SOCIAL COURAGE \u00b7 ON MY TERMS', 0, 0)
  context.restore()

  context.fillStyle = palette.yellow
  context.fillRect(52, 48, 104, 104)
  drawArrow(context, 104, 100, .82)

  context.fillStyle = palette.red
  context.font = '800 23px "Bricolage Grotesque Variable", sans-serif'
  context.letterSpacing = '3px'
  context.fillText('ALL RISK, NO REWARD', 282, 68)

  context.fillStyle = palette.ink
  context.font = '520 83px "Petrona Variable", Georgia, serif'
  context.letterSpacing = '-3px'
  context.fillText(complete ? 'I SHOWED UP.' : 'I MADE THE TRY.', 278, 165)

  context.fillStyle = palette.blue
  context.font = '800 20px "Bricolage Grotesque Variable", sans-serif'
  context.letterSpacing = '3px'
  context.fillText(complete ? 'CHALLENGE COMPLETE' : 'PARTIAL PROGRESS COUNTS', 282, 214)

  if (safe.challengeTitle) {
    context.fillStyle = palette.ink
    context.font = '560 34px "Petrona Variable", Georgia, serif'
    context.letterSpacing = '-1px'
    wrapText(context, `\u201c${safe.challengeTitle}\u201d`, 282, 277, 704, 42, 2)
  } else {
    context.fillStyle = palette.ink
    context.font = '500 36px "Petrona Variable", Georgia, serif'
    context.letterSpacing = '-1px'
    context.fillText('One brave rep, on my terms.', 282, 277)
    context.fillStyle = palette.blue
    context.font = '650 18px "Bricolage Grotesque Variable", sans-serif'
    context.letterSpacing = '1px'
    context.fillText('THE DETAILS STAY PRIVATE.', 284, 315)
  }

  context.fillStyle = palette.cream
  context.fillRect(282, 388, 286, 136)
  context.strokeStyle = palette.ink
  context.lineWidth = 2
  context.strokeRect(282, 388, 286, 136)
  context.fillRect(596, 388, 286, 136)
  context.strokeRect(596, 388, 286, 136)

  context.fillStyle = palette.red
  context.font = '560 55px "Petrona Variable", Georgia, serif'
  context.letterSpacing = '-1px'
  context.fillText(`+${safe.points}`, 310, 458)
  context.fillStyle = palette.ink
  context.font = '800 15px "Bricolage Grotesque Variable", sans-serif'
  context.letterSpacing = '2px'
  context.fillText('COURAGE POINTS', 312, 493)

  context.fillStyle = palette.blue
  context.font = '560 55px "Petrona Variable", Georgia, serif'
  context.letterSpacing = '-1px'
  context.fillText(String(safe.streak), 624, 458)
  context.fillStyle = palette.ink
  context.font = '800 15px "Bricolage Grotesque Variable", sans-serif'
  context.letterSpacing = '2px'
  context.fillText(safe.streak === 1 ? 'DAY STREAK' : 'DAY STREAK', 626, 493)

  context.fillStyle = palette.ink
  context.fillRect(232, 578, WIDTH - 232, 52)
  context.fillStyle = palette.cream
  context.font = '800 17px "Bricolage Grotesque Variable", sans-serif'
  context.letterSpacing = '2px'
  context.fillText('#ALLRISKNOREWARD', 282, 611)
  context.fillStyle = palette.yellow
  context.fillText('SHARED BY CHOICE \u2192', 928, 611)
}

export async function createShareCard(details: ShareCardDetails): Promise<ShareCardArtifact> {
  await document.fonts?.ready

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser could not prepare the share card.')

  drawShareCard(context, details)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result)
      else reject(new Error('This browser could not export the share card.'))
    }, 'image/png')
  })
  const file = new File([blob], `all-risk-no-reward-${details.verdict}.png`, { type: 'image/png' })

  return { blob, file, caption: buildShareCaption(details) }
}

export function supportsNativeImageShare(file: File) {
  return typeof navigator.share === 'function'
    && typeof navigator.canShare === 'function'
    && navigator.canShare({ files: [file] })
}

export function downloadShareCard(blob: Blob, verdict: ShareVerdict) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `all-risk-no-reward-${verdict}.png`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export async function copyShareCaption(caption: string) {
  try {
    await navigator.clipboard.writeText(caption)
    return
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = caption
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.append(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    textarea.remove()
    if (!copied) throw new Error('Copy is unavailable in this browser. Select the caption and copy it manually.')
  }
}
