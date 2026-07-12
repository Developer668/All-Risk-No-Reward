import { ArrowRight, Bell, LockKeyhole, MessageCircleMore, ShieldCheck, Sparkles, Star, Trophy, UserRound, Zap, Clock3 } from 'lucide-react'
import { Brand } from './Brand'

interface LandingProps {
  onTry: () => void
  onAuth: () => void
  onNavigate: (route: 'privacy' | 'terms') => void
}

export function Landing({ onTry, onAuth, onNavigate }: LandingProps) {
  return (
    <main className="landing">
      <nav className="landing-nav shell" aria-label="Main navigation">
        <Brand />
        <div className="landing-nav__links">
          <a href="#how">How it works</a>
          <a href="#safety">Safety</a>
        </div>
        <button className="button button--ink button--small" onClick={onAuth}>Sign in <ArrowRight size={16} aria-hidden="true" /></button>
      </nav>

      <section className="hero shell">
        <div className="hero__copy">
          <div className="eyebrow"><Sparkles size={15} aria-hidden="true" /> YOUR COMFORT ZONE CALLED. WE DECLINED.</div>
          <h1>Do one brave<br />thing <i>today.</i></h1>
          <p className="hero__lede">Practice real social confidence with one private, level-appropriate challenge at a time.</p>
          <div className="hero__actions">
            <button className="button button--accent" onClick={onTry}>Try the working demo <ArrowRight size={19} aria-hidden="true" /></button>
            <span>No card required. No public posting. Your boundaries always win.</span>
          </div>
          <div className="hero__trust">
            <div className="privacy-seal" aria-hidden="true"><LockKeyhole size={17} /></div>
            <div><strong>Private by default</strong><br />Your proof and progress stay under your control.</div>
          </div>
        </div>

        <div className="hero__visual" role="img" aria-label="Example daily challenge card: give someone a sincere, specific compliment">
          <div className="sun" aria-hidden="true" />
          <span className="scribble scribble--one" aria-hidden="true">tiny risk</span>
          <span className="scribble scribble--two" aria-hidden="true">real growth ↗</span>
          <div className="challenge-card challenge-card--hero" aria-hidden="true">
            <div className="challenge-card__topline"><span>DAY 04</span><span><Star size={14} fill="currentColor" /> LEVEL 2</span></div>
            <div className="challenge-card__icon"><MessageCircleMore size={26} /></div>
            <p className="challenge-card__label">TODAY’S CHALLENGE</p>
            <h2>Say the<br />specific thing.</h2>
            <p>Give someone a sincere compliment about a choice they made—not their appearance.</p>
            <div className="challenge-card__footer"><span><Clock3 size={16} /> 5 MIN</span><span>+120 POINTS</span></div>
          </div>
          <div className="stamp" aria-hidden="true">AWKWARD<br />IS ALLOWED</div>
        </div>
      </section>

      <section className="ticker" aria-label="Product principles">
        <div>SMALL RISKS <span>✦</span> REAL PROGRESS <span>✦</span> ZERO PUBLIC SHAME <span>✦</span> YOUR BOUNDARIES, ALWAYS <span>✦</span></div>
      </section>

      <section id="how" className="steps shell">
        <div className="section-kicker">THE DAILY LOOP</div>
        <div className="steps__heading">
          <h2>Courage is a skill.<br /><i>Practice it.</i></h2>
          <p>The app adds enough surprise to interrupt avoidance while keeping you in control of what is safe and appropriate.</p>
        </div>
        <div className="steps__grid">
          <article><span>01</span><Bell aria-hidden="true" /><h3>Wake up curious</h3><p>Your private challenge unlocks at a different daytime hour.</p></article>
          <article><span>02</span><Zap aria-hidden="true" /><h3>Take the tiny risk</h3><p>Do the challenge—or complete a smaller, valid version when life gets messy.</p></article>
          <article><span>03</span><Trophy aria-hidden="true" /><h3>Show your work</h3><p>Submit a privacy-safe note or photo. AI offers a score, never a moral judgment.</p></article>
        </div>
      </section>

      <section id="safety" className="safety">
        <div className="shell safety__inner">
          <div>
            <span className="section-kicker section-kicker--light">BUILT WITH A BACKBONE</span>
            <h2>Push your edge.<br /><i>Keep your agency.</i></h2>
          </div>
          <div className="safety__list">
            <p><ShieldCheck aria-hidden="true" /> No challenge requires harassment, deception, sexual content, public humiliation, or unsolicited romantic contact.</p>
            <p><UserRound aria-hidden="true" /> The app never impersonates you. Suggested messages always require your review and your tap to send.</p>
            <p><LockKeyhole aria-hidden="true" /> Proof is private. Names, faces, and another person’s messages are never required.</p>
          </div>
        </div>
      </section>

      <footer className="footer shell">
        <Brand />
        <p>For adults practicing everyday confidence. Not therapy or emergency support.</p>
        <div className="footer__links">
          <button onClick={() => onNavigate('privacy')}>Privacy</button>
          <button onClick={() => onNavigate('terms')}>Terms</button>
          <button onClick={onTry}>OPEN THE DEMO <ArrowRight size={16} aria-hidden="true" /></button>
        </div>
      </footer>
    </main>
  )
}
