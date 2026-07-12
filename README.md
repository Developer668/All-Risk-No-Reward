# All Risk, No Reward

A consent-first daily social-courage PWA. It unlocks one unpredictable, level-appropriate challenge each day, records privacy-safe proof, gives partial credit, and uses bounded private recovery tasks when a challenge is missed.

## Works out of the box

```bash
npm install
npm run dev
```

Open the printed local URL and choose **Preview sample data**, or create a local account. No cloud project or API key is required for local mode.

### Developer lab

While `npm run dev` is running, the local demo adds a dedicated **Developer lab** page to the app navigation. It can generate a different card at an exact difficulty and category, unlock or relock it, simulate full/partial/missed results, complete recovery, reset today's test records, and copy the current state as JSON. The page is excluded from production builds and is never available for synced accounts.

Local mode includes:

- Salted PBKDF2 passwords, 30-day sessions, local sign-up/sign-in/reset, export, and deletion
- Deterministic per-user daily assignments, random 10:00–18:00 unlocks, and a 22:00 deadline
- Full, partial, missed, reported, recovery-blocked, and recovered states
- Exact awards: score 72+ → 120 points, 25–71 → 60 points, below 25 → 0
- Immediate recovery after partial proof, plus two irreversible punishment-dice rerolls that never repeat an item for that account
- Streaks, levels, history, milestones, settings, boundaries, and a private inbox
- One guaranteed optional bonus offer per completed day; completing it banks a single-use Progress Ticket that automatically protects one future partial or missed day
- Browser notification permission, installable PWA metadata, service worker caching, and offline reload
- A clearly labelled on-device sample review; synced accounts use real OpenAI video-frame verification
- Opt-in branded share cards with native share, caption copy, and PNG download; private proof is never included

## Optional InsForge + AI proof-provider mode

Copy `.env.example` to `.env.local` and supply the public InsForge URL and anon key. Production is configured for OpenAI proof verification with `gpt-4.1-nano`. A proof may contain up to four images or videos, including mixed submissions and multiple videos. The browser extracts a small set of timestamped frames from every selected video and sends only those frames through the InsForge edge function; full videos never leave the browser. The edge function retains optional Gemini, OpenRouter, and NVIDIA NIM adapters for development. The browser never receives a provider key or project-admin secret.

The production backend in `insforge/` adds:

- InsForge authentication, email verification/reset methods, OAuth-provider discovery, and row-level security
- Timezone-aware server assignments, reminders, recovery locks, safety reports, deletion requests, and scheduled maintenance
- Deterministic challenge loading, selection, filtering, and upload validation; OpenAI is used only for authenticated interpretation of submitted proof images and sampled video frames, with the InsForge `verify-proof` edge function acting as the secure proxy
- Ephemeral proof images (PNG/JPEG/WebP) or timestamped JPEG frames extracted from short videos (MP4/MOV/WebM; the browser enforces 80 MiB and 30 seconds); only a hash of the submitted evidence package, media type, size, and optional filename are retained
- Server-owned scoring, points, streaks, rate limits, and idempotent completion upgrades
- The repository-backed 500-challenge catalog, operator-fed punishment tasks, atomic two-roll dice limits, and an owner-readable no-repeat audit trail

Follow [insforge/README.md](./insforge/README.md) for the exact schema import, secrets, edge-function deployment, schedule, and post-deployment security checks. The repository is ready to deploy, but it is intentionally not tied to a specific InsForge project.

OpenRouter, Gemini, and NVIDIA adapters remain available for development, but model capacity, rate limits, media support, and availability vary. Provider retention and training terms also differ. Do not submit confidential or identifying proof, disclose the configured provider, and review its current terms before launch.

Never put `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `NVIDIA_NIM_API_KEY`, an InsForge admin key, or the maintenance secret in a `VITE_` variable. Vite-prefixed values are public browser configuration.

## Verification

```bash
npm run verify       # lint, unit/domain tests, Sites build, dependency audit, runtime E2E, PWA/offline test
npm run e2e:visual   # regenerate desktop/mobile visual QA screenshots
```

`data/challenges/*.json` is the challenge source of truth. Local mode imports all
500 records directly. `npm run catalog:generate` deterministically rebuilds the
rerunnable InsForge seed without using an AI model.

The runtime suite exercises 320, 390, 768, 1024, and 1440 px layouts; native-dialog focus and Escape behavior; local auth; full and partial proof; immediate recovery; both no-repeat dice rolls and reload persistence; recovery completion; daily bonus offers and Progress Ticket redemption; report-and-replace; branded share privacy, copy, PNG export; settings persistence; notifications; and browser console errors.

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
