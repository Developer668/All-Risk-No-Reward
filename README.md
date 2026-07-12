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

## Optional InsForge + Gemini Developer API mode

Copy `.env.example` to `.env.local` and supply the public InsForge URL and anon key. Create the backend-only `GEMINI_API_KEY` in Google AI Studio; the browser never receives that key or a project-admin secret. `GEMINI_PROOF_MODEL` is optional and defaults to `gemini-3.5-flash`.

The production backend in `insforge/` adds:

- InsForge authentication, email verification/reset methods, OAuth-provider discovery, and row-level security
- Timezone-aware server assignments, reminders, recovery locks, safety reports, deletion requests, and scheduled maintenance
- Authenticated proof assessment through the Gemini Developer API, with the InsForge `verify-proof` edge function acting only as a secure proxy
- Ephemeral proof images (PNG/JPEG/WebP, capped at 180 KiB after browser compression) or short videos (MP4/MOV/WebM; the browser enforces 5 MiB and 30 seconds, while the server independently enforces 5 MiB); only a hash, media type, size, and optional filename are retained
- Server-owned scoring, points, streaks, rate limits, and idempotent completion upgrades
- Operator-fed challenge and punishment catalogs, atomic two-roll dice limits, and an owner-readable no-repeat audit trail

Follow [insforge/README.md](./insforge/README.md) for the exact schema import, secrets, edge-function deployment, schedule, and post-deployment security checks. The repository is ready to deploy, but it is intentionally not tied to a specific InsForge project.

Google states that content submitted through the free tier of the Gemini Developer API may be used to improve its products; content submitted through the paid tier is not used for that purpose. Do not submit confidential or identifying proof. Review Google's current terms before launch.

Never put `GEMINI_API_KEY`, an InsForge admin key, or the maintenance secret in a `VITE_` variable. Vite-prefixed values are public browser configuration.

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

## Challenge Library

The application-ready dataset is in [`data/challenges`](data/challenges/README.md). It contains **500 original same-day challenges** designed around funny, filmable, social, creative, helpful, and physically scalable experiences:

- Easy
- Medium
- Hard
- Extreme
- Nightmare

Easy contains 90 challenges, Medium 95, Hard 100, Extreme 105, and Nightmare 110. Every challenge includes a description and structured image/video evidence rules for VLM grading. Retired IDs are recorded rather than reused.

The final library includes level-scaled Instagram and friend connections, private ask-outs to people already known, group hangouts, scalable specialist workouts, cooking games, hackathons, video-game builds, VM-only operating-system projects, community tools, and coding challenges using local and cloud AI model families.

## Contributing

Contributions, ideas, and bug reports are welcome. Open an issue to start a discussion.

## License

This project is licensed under the [Apache License 2.0](LICENSE).
