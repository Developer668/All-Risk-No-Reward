import { describe, expect, it } from 'vitest'
import { buildShareCaption } from './shareCard'

describe('privacy-safe share captions', () => {
  it('keeps the challenge title private by default', () => {
    const caption = buildShareCaption({
      verdict: 'complete',
      points: 120,
      streak: 4,
      challengeTitle: 'A private challenge title',
      includeChallengeTitle: false,
    })

    expect(caption).toContain('All Risk, No Reward')
    expect(caption).toContain('+120 courage points')
    expect(caption).toContain('4-day courage streak')
    expect(caption).not.toContain('private challenge title')
  })

  it('includes only a sanitized catalog title when the user opts in', () => {
    const caption = buildShareCaption({
      verdict: 'partial',
      points: 60,
      streak: 0,
      challengeTitle: 'Say hello\nwithout names\t',
      includeChallengeTitle: true,
    })

    expect(caption).toContain('I made a real attempt')
    expect(caption).toContain('Challenge: “Say hello without names”')
    expect(caption).not.toContain('\n')
    expect(caption).not.toContain('\t')
  })
})
