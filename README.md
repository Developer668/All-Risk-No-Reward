# All Risk, No Reward

A consent-first daily social-courage PWA. It unlocks one unpredictable, level-appropriate challenge each day, records privacy-safe proof, gives partial credit, and uses bounded private recovery tasks when a challenge is missed.

## Works out of the box

```bash
npm install
npm run dev
```

Open the printed local URL and choose **Try the working demo**, or create a local account. No cloud project or API key is required for local mode.

Local mode includes:

- Salted PBKDF2 passwords, 30-day sessions, local sign-up/sign-in/reset, export, and deletion
- Deterministic per-user daily assignments, random 10:00–18:00 unlocks, and a 22:00 deadline
- Full, partial, missed, reported, recovery-blocked, and recovered states
- Exact awards: score 72+ → 120 points, 25–71 → 60 points, below 25 → 0
- Immediate recovery after partial proof, plus two irreversible punishment-dice rerolls that never repeat an item for that account
- Streaks, levels, history, milestones, settings, boundaries, and a private inbox
- A one-time fast-finish bonus round that can bank a recovery lifeline—or playfully award nothing
- Browser notification permission, installable PWA metadata, service worker caching, and offline reload
- A concrete-detail proof heuristic for the no-backend demo; proof images are processed in memory and never stored
- Opt-in branded share cards with native share, caption copy, and PNG download; private proof is never included

## Optional InsForge + NVIDIA mode

Copy `.env.example` to `.env.local` and supply the public InsForge URL and anon key. The browser never receives an NVIDIA or project-admin secret.

The production backend in `insforge/` adds:

- InsForge authentication, email verification/reset methods, OAuth-provider discovery, and row-level security
- Timezone-aware server assignments, reminders, recovery locks, safety reports, deletion requests, and scheduled maintenance
- Authenticated NVIDIA NIM proof assessment through `verify-proof`
- Ephemeral, metadata-stripped images capped at 180 KiB; only a hash, media type, size, and optional filename are retained
- Server-owned scoring, points, streaks, rate limits, and idempotent completion upgrades
- Operator-fed challenge and punishment catalogs, atomic two-roll dice limits, and an owner-readable no-repeat audit trail

Follow [insforge/README.md](./insforge/README.md) for the exact schema import, secrets, edge-function deployment, schedule, and post-deployment security checks. The repository is ready to deploy, but it is intentionally not tied to a specific InsForge project.

Never put `NVIDIA_API_KEY`, an InsForge admin key, or the maintenance secret in a `VITE_` variable. Vite-prefixed values are public browser configuration.

## Verification

```bash
npm run verify       # lint, unit/domain tests, Sites build, dependency audit, runtime E2E, PWA/offline test
npm run e2e:visual   # regenerate desktop/mobile visual QA screenshots
```

The runtime suite exercises 320, 390, 768, 1024, and 1440 px layouts; native-dialog focus and Escape behavior; local auth; full and partial proof; immediate recovery; both no-repeat dice rolls and reload persistence; recovery completion; fast-finish bonus outcomes and lifeline redemption; report-and-replace; branded share privacy, copy, PNG export; settings persistence; notifications; and browser console errors.

## Product guardrails

- Adults only in this build; Terms and Privacy acknowledgement are part of sign-up.
- Challenges never require harassment, deception, danger, sexual content, humiliation, or unsolicited romantic contact.
- The app never controls Instagram, scrapes contacts, impersonates a user, or sends a message automatically.
- Every suggestion is user-reviewed and user-sent. Every challenge can be resized, filtered, reported, or replaced.
- Proof never requires another person’s name, face, contact information, or private reply.
- Only active, operator-reviewed catalog rows can be assigned. The ranked 1–5 punishment catalog must remain legal, constructive, consent-respecting, and easy for another person to decline.
- This is a self-guided habit tool, not therapy, diagnosis, treatment, or emergency support.

## Before a public commercial launch

- Link and deploy to the intended InsForge project, then run the two-account RLS checklist in `insforge/README.md`.
- Add a Web Push subscription/provider if notifications must arrive while the PWA is fully closed. Current local alerts run while the app is active; the remote outbox remains durable.
- Add catalog moderation/admin operations and account-deletion processing for the pseudonymous deletion queue.
- Obtain jurisdiction-specific legal, privacy, accessibility, and clinical-claims review.
