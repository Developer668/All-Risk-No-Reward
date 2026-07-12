import { ArrowLeft, LockKeyhole, ShieldCheck } from 'lucide-react'
import { Brand } from './Brand'

interface LegalPageProps {
  type: 'privacy' | 'terms'
  onBack: () => void
}

export function LegalPage({ type, onBack }: LegalPageProps) {
  const privacy = type === 'privacy'
  return (
    <main className="legal-page">
      <header className="legal-header shell">
        <Brand />
        <button className="button button--ink button--small" onClick={onBack}><ArrowLeft size={17} aria-hidden="true" /> Back</button>
      </header>
      <article className="legal-document shell">
        <span className="section-kicker">{privacy ? 'YOUR DATA, PLAINLY' : 'THE GROUND RULES'}</span>
        <h1>{privacy ? 'Privacy policy.' : 'Terms of use.'}</h1>
        <p className="legal-document__updated">Current product policy · Updated July 12, 2026</p>

        {privacy ? <>
          <section><h2>What this app stores</h2><p>Local mode stores your account, settings, assignments, notes, scores, and progress in this browser. Your local password is salted and hashed; it is never stored as readable text. Anyone with access to your browser profile may still be able to delete local data.</p></section>
          <section><h2>When InsForge is connected</h2><p>Remote mode stores your account and challenge records in the configured InsForge project. Row-level security limits reads to your account, and progression writes are handled by server-owned functions.</p></section>
          <section><h2>AI proof checks</h2><p>Before a remote proof check, the app tells you that your proof note and any selected image will be sent to NVIDIA for automated assessment. Images are resized and stripped of embedded metadata in your browser. You never need to include names, faces, private replies, or identifying information.</p></section>
          <section><h2>Notifications</h2><p>Browser notifications are optional. The app asks before enabling them, and you can turn them off in Settings or in your browser at any time.</p></section>
          <section><h2>Sharing a win</h2><p>Sharing is always optional and user-initiated. The branded card includes only your result, points, streak, and—only when you switch it on—the catalog challenge title. It never includes proof, private reflections, contacts, account details, or another person’s information.</p></section>
          <section><h2>Your choices</h2><p>You can export local data, change challenge boundaries, disable notifications, or delete your app data from Settings. We do not sell personal data or use proof to advertise to you.</p></section>
        </> : <>
          <section><h2>Adults only</h2><p>You must be at least 18 years old to create an account in this build.</p></section>
          <section><h2>Voluntary challenges</h2><p>Every challenge is optional. Resize, replace, or skip anything that feels unsafe, inappropriate, or beyond your boundaries. Recovery tasks are private accountability exercises—not humiliation or punishment.</p></section>
          <section><h2>Respect other people</h2><p>Do not harass, deceive, threaten, pressure, impersonate, or expose anyone. Do not upload another person’s private messages, face, contact information, or other identifying data without permission.</p></section>
          <section><h2>No autonomous messaging</h2><p>The app may suggest words, but it never sends a message, posts to social media, or contacts another person for you. You review and send every communication yourself.</p></section>
          <section><h2>Not medical care</h2><p>This product is a self-guided habit tool, not therapy, diagnosis, treatment, or emergency support. If you are in immediate danger or crisis, contact local emergency services or a qualified crisis service.</p></section>
          <section><h2>Accountability</h2><p>You are responsible for choosing an appropriate setting and complying with applicable laws, platform rules, workplace policies, and other people’s boundaries.</p></section>
        </>}

        <aside className="legal-note">
          {privacy ? <LockKeyhole aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
          <p><strong>{privacy ? 'Privacy is a product feature.' : 'Agency is the rule.'}</strong><br />This text documents the behavior of the current build. Obtain jurisdiction-specific legal review before a public commercial launch.</p>
        </aside>
      </article>
    </main>
  )
}
