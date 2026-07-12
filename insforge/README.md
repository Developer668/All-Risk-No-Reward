# InsForge backend setup

This directory contains the production backend contract for All Risk, No Reward.
It is designed to be safe to import more than once. Authenticated users can read
their own rows, but assignments, AI scores, streaks, points, recoveries, and
notifications are written only through narrow RPCs.

## What is implemented

- Per-user, timezone-aware daily assignments with deterministic random unlocks
  inside the user's configured window (the end must be no later than 19:00).
- A deadline at the end of the user's local day.
- Server-owned partial/full completion scoring and points.
- Missed-assignment recovery tasks whose starting difficulty reflects genuine
  progress and whose reviewed task escalates once per missed due date.
- Up to two atomic punishment dice rerolls per open recovery. A roll samples
  uniformly from every active catalog item, can be easier or harder, never
  repeats an item previously assigned to that account, and is permanently
  recorded in an owner-readable audit trail.
- A recovery lock that prevents the next challenge from loading.
- Durable notification-outbox events for unlocks and recovery changes.
- Five-per-10-minute and 20-per-24-hour AI proof rate limits.
- AI consent, age-confirmation, terms, privacy, boundaries, and category settings.
- Safety reports that replace an open challenge and exclude the reported
  challenge from that user's future selection.
- Immediate app-data erasure plus an account-deletion queue for the remaining
  InsForge Auth account.
- The repository's safety-reviewed 500-item challenge catalog, imported from a
  generated rerunnable seed. The operator still supplies punishment content.

No backend code sends a message, controls a social account, impersonates a user,
or publishes proof. A submitted image, or timestamped JPEG frames extracted from
a selected video in the browser, is sent ephemerally to the configured AI endpoint.
The full video never leaves the browser. Only the evidence package's SHA-256 hash,
media type, byte count, and user-provided filename are retained by this app.

## Deploy

Use the CLI through `npx`; do not install it globally.

```bash
npx @insforge/cli login
npx @insforge/cli link
npx @insforge/cli current
npx @insforge/cli metadata --json
npx @insforge/cli db import insforge/schema.sql
npm run catalog:apply
```

The generated challenge seed upserts the repository's stable IDs and is safe to
rerun. Rebuild it with `npm run catalog:generate` whenever
`data/challenges/*.json` changes; `npm run catalog:check` verifies that the seed
is current. `npm run catalog:apply` sends the same upsert through the linked
InsForge CLI in bounded batches. The generator validates counts, IDs, evidence
types, and mappings without calling an AI model. `recovery_catalog` remains
operator-managed and must be populated with reviewed rows before punishments
can run.

The edge runtime needs these values:

| Secret | Required | Purpose |
|---|---:|---|
| `INSFORGE_BASE_URL` | yes | Project base URL, such as `https://APP.REGION.insforge.app` |
| `INSFORGE_API_KEY` | yes | Project-admin key used only inside trusted functions |
| `PROOF_AI_PROVIDER` | no | `auto` (default), `openai`, `gemini`, `openrouter`, or `nvidia-nim` |
| `OPENAI_API_KEY` | for OpenAI | Backend-only OpenAI project API key |
| `OPENAI_PROOF_MODEL` | no | Defaults to low-cost vision-capable `gpt-5-nano` |
| `GEMINI_API_KEY` | for Gemini | Gemini Developer API key created in Google AI Studio |
| `GEMINI_PROOF_MODEL` | no | Defaults to `gemini-3.5-flash` |
| `OPENROUTER_API_KEY` | for OpenRouter | Backend-only OpenRouter key |
| `OPENROUTER_PROOF_MODEL` | no | Defaults to `openrouter/free`; choose a model that supports the submitted media type |
| `OPENROUTER_BASE_URL` | no | Defaults to `https://openrouter.ai/api/v1` |
| `OPENROUTER_SITE_URL` | no | Public site URL sent as OpenRouter's optional `HTTP-Referer` attribution header |
| `NVIDIA_NIM_API_KEY` | for NVIDIA NIM | Backend-only NVIDIA Developer API key |
| `NVIDIA_NIM_PROOF_MODEL` | no | Defaults to `nvidia/nemotron-nano-12b-v2-vl`, which accepts text, image, and video inputs |
| `NVIDIA_NIM_BASE_URL` | no | Defaults to NVIDIA's hosted `https://integrate.api.nvidia.com/v1`; may point to a compatible NIM deployment |
| `ALLOWED_ORIGINS` | yes in production | Comma-separated exact web origins; no paths or wildcards |
| `DAILY_MAINTENANCE_SECRET` | yes | Independent random bearer secret for the schedule |

`INSFORGE_BASE_URL` and `INSFORGE_API_KEY` may already be reserved/injected by
the project runtime. Confirm that before adding duplicates. Add the application
secrets with the CLI (values below are placeholders):

```bash
npx @insforge/cli secrets add PROOF_AI_PROVIDER openai
npx @insforge/cli secrets add OPENAI_API_KEY YOUR_OPENAI_API_KEY
npx @insforge/cli secrets add OPENAI_PROOF_MODEL gpt-5-nano

# Or use OpenRouter instead:
# npx @insforge/cli secrets add PROOF_AI_PROVIDER openrouter
# npx @insforge/cli secrets add OPENROUTER_API_KEY YOUR_OPENROUTER_API_KEY
# npx @insforge/cli secrets add OPENROUTER_PROOF_MODEL openrouter/free

# Or use NVIDIA NIM instead:
# npx @insforge/cli secrets add PROOF_AI_PROVIDER nvidia-nim
# npx @insforge/cli secrets add NVIDIA_NIM_API_KEY YOUR_NVIDIA_NIM_API_KEY
# npx @insforge/cli secrets add NVIDIA_NIM_PROOF_MODEL nvidia/nemotron-nano-12b-v2-vl

# Or use Gemini instead:
# npx @insforge/cli secrets add PROOF_AI_PROVIDER gemini
npx @insforge/cli secrets add GEMINI_API_KEY YOUR_GEMINI_API_KEY
npx @insforge/cli secrets add GEMINI_PROOF_MODEL gemini-3.5-flash
npx @insforge/cli secrets add ALLOWED_ORIGINS https://your-site.example
npx @insforge/cli secrets add DAILY_MAINTENANCE_SECRET REPLACE_WITH_64_RANDOM_HEX_CHARACTERS
npx @insforge/cli functions deploy verify-proof --file insforge/functions/verify-proof/index.ts
npx @insforge/cli functions deploy daily-maintenance --file insforge/functions/daily-maintenance/index.ts
```

`auto` selects the first configured key in this order: OpenAI, Gemini,
OpenRouter, NVIDIA NIM. It does not silently retry proof through a different provider.
OpenRouter's free router is rate-limited and model availability varies. NVIDIA
Developer API access is intended for development and testing; production terms
may differ. Do not submit confidential or identifying proof, disclose the
selected provider to users, and review that provider's current retention,
training, rate-limit, and production-use terms before launch.

Generate the maintenance value locally with `openssl rand -hex 32`. Keep it out
of source control and use the same stored secret in the schedule header.

Create a 15-minute maintenance schedule. InsForge schedules use five-field cron
syntax and function URLs use `/functions/{slug}`:

```bash
npx @insforge/cli schedules create \
  --name "All Risk daily maintenance" \
  --cron "*/15 * * * *" \
  --url "https://APP.REGION.insforge.app/functions/daily-maintenance" \
  --method POST \
  --headers '{"Authorization":"Bearer ${{secrets.DAILY_MAINTENANCE_SECRET}}","Content-Type":"application/json"}' \
  --body '{"batchSize":500}'
```

The login path also runs overdue maintenance for that user, so deadline and
recovery enforcement still converges if a scheduled invocation is delayed.

## Frontend RPC contract

All calls below use `insforge.database.rpc(...)` as the signed-in user.

### Load or create today's state

```ts
const { data, error } = await insforge.database.rpc('ensure_daily_assignment')
```

Returns:

```ts
{
  blocked: boolean
  reason: null | 'challenge-locked' | 'recovery-required' |
    'no-eligible-challenge' | 'account-deletion-pending'
  assignment: DailyAssignment | null
  challenge: Challenge | null // intentionally null before unlock
  recovery: RecoveryTask | null
  profile: Profile
}
```

### Update preferences and consent

```ts
await insforge.database.rpc('update_profile_preferences', {
  p_display_name: 'Ada',
  p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  p_notification_enabled: true,
  p_unlock_window_start: '10:00',
  p_unlock_window_end: '18:00',
  p_deadline_time: '22:00',
  p_morning_reminder_time: '08:00',
  p_morning_reminder_enabled: true,
  p_unlock_reminder_enabled: true,
  p_deadline_reminder_enabled: true,
  p_max_difficulty: 3,
  p_boundaries: ['No romantic dares', 'No public posting'],
  p_disabled_categories: [],
  p_disabled_boundary_tags: ['direct-message', 'voice-message'],
  p_proof_ai_consent: true,
  p_minimum_age_confirmed: true,
  p_accept_terms: true,
  p_acknowledge_privacy: true,
})
```

Only supplied parameters change. Points, streak, and level are not accepted.
Boundary tags include direct/voice messaging, invitations, vulnerable
disclosures, consent, group activity, social platforms, and physical activity;
challenges with any disabled tag are excluded server-side.

### Verify proof

Invoke the edge function, not the completion table:

```ts
await insforge.functions.invoke('verify-proof', {
  body: {
    assignmentId,
    proofNote, // optional context; may be an empty string
    mediaItems: [
      { kind: 'image', name: 'photo.jpg', dataUrl },
      { kind: 'video', name: 'clip.webm', frames: videoFrames, durationSeconds: 12.4 },
    ],
    proofName, // optional combined display name only
  },
})
```

`mediaItems` accepts up to four images or sampled videos, including mixed image/video
submissions and up to three videos. The normal video flow accepts MP4, MOV, or WebM
files up to 80 MiB and 30 seconds in the browser, then extracts three timestamped JPEG
frames normally or six for counted and motion-heavy challenges. Each frame is resized to at
most 720 px and capped at 170 KiB before submission. Full videos stay in the browser.
Image proof accepts PNG, JPEG, or WebP and is likewise resized and re-encoded. The
edge function independently validates attachment count, frame count, MIME type, and
total evidence size. It temporarily accepts the legacy `videoFrames`, `mediaDataUrl`,
and `imageDataUrl` fields during rollout.

The function performs request-size, MIME, ownership, assignment-state, and
catalog evidence-type checks deterministically. Only then does it reserve a
rate-limited attempt and send the images and timestamped frame samples to OpenAI in
production, because interpreting pixels is the part that requires a vision model.
The optional note is context only and cannot prove completion by itself. It records the result through the
project-admin-only
`record_verified_completion` RPC. InsForge does not perform the AI assessment;
its edge function is the authentication and provider proxy. The client cannot
provide a challenge prompt, score, verdict, points, or user ID.
Server scoring matches the product contract: a score of 72–100 awards 120 total
assignment points, 25–71 awards 60 total assignment points, and 0–24 awards 0.
Upgrading a partial result to complete awards only the remaining 60, preventing
repeat submissions from farming points.

A partial result (25–71) creates its recovery task in the same database
transaction as the verified completion. The function response includes that
`recovery`, and the next `ensure_daily_assignment` call immediately returns
`blocked: true` with `reason: 'recovery-required'`; it does not wait for the
assignment deadline or the maintenance schedule. Initial difficulty is derived
from the verified score, and the selected item is taken only from the
operator-supplied, active, account-unseen recovery catalog. If that catalog is
empty or exhausted, the partial result is preserved and maintenance retries
after reviewed content is added rather than inventing a punishment.
Scores of 60–71 start at difficulty 1, scores of 25–59 start at difficulty 2,
and a missed or lower-scoring attempt starts at difficulty 3.

### Complete recovery

```ts
const { data } = await insforge.database.rpc('complete_recovery_task', {
  p_recovery_id: recoveryId,
  p_completion_note: 'A short, concrete private reflection on what I did.',
})
```

The note must be 12–1000 characters. The response is the refreshed daily state.

### Roll the punishment dice

```ts
const { data } = await insforge.database.rpc('reroll_recovery_task', {
  p_recovery_id: recoveryId,
})
```

Only the owner of an open recovery can call this RPC. The recovery row is locked
for the transaction, so simultaneous requests cannot spend more than two rolls.
Each successful roll draws with equal probability from the full active
`recovery_catalog`, excluding the current item and every catalog item ever
assigned to that user. The difficulty is deliberately not filtered, so the new
result can be easier, the same difficulty, or harder. A failed roll caused by an
exhausted catalog does not consume an allowance.

Returns:

```ts
{
  recovery: RecoveryTask
  rerollsRemaining: 0 | 1
  previousDifficulty: 1 | 2 | 3 | 4 | 5
  direction: 'easier' | 'same' | 'harder'
}
```

`recovery_assignment_history` stores an immutable content snapshot for initial
assignments, automatic escalations, and dice rerolls. Authenticated users can
read only their own history; direct client writes remain revoked.

### Report and replace a challenge

```ts
const { data } = await insforge.database.rpc('report_challenge', {
  p_assignment_id: assignmentId,
  p_reason: 'crosses-boundary',
  p_details: 'Optional privacy-safe detail',
})
```

Reasons are `crosses-boundary`, `unsafe`, `inappropriate`, `not-accessible`, or
`other`. Only locked/active assignments can be replaced. The response contains
`{ report, state, idempotent }`; reports are readable only by their owner and
insertable only through this validated RPC.

### Notifications

Read `notification_outbox` with the normal database client and mark up to 50 as
read at once:

```ts
await insforge.database.rpc('mark_notifications_read', {
  p_notification_ids: notificationIds,
})
```

The outbox is the durable source for in-app/browser notifications. Web Push to a
closed browser requires a separate push provider and subscription worker; it is
not faked by this schema.

### Delete user data

```ts
await insforge.database.rpc('delete_my_app_data', {
  p_confirmation: 'DELETE MY DATA',
})
```

This immediately removes profile, assignment, proof, recovery, report, and
notification data. It leaves one pseudonymous `account_deletion_requests` row.
An administrator must then delete the corresponding user from InsForge Auth and
mark that request processed; this schema does not assume undocumented access to
the platform-owned `auth.users` table.

## Verify after deployment

```bash
npx @insforge/cli db tables
npx @insforge/cli db policies
npx @insforge/cli db functions
npx @insforge/cli functions list
npx @insforge/cli schedules list
npx @insforge/cli diagnose advisor --category security
```

Use two test accounts to confirm RLS: each account should see only its own
profile, assignments, attempts, completions, recoveries, reports, notifications,
and deletion request. Direct `INSERT`, `UPDATE`, or `DELETE` against progression
tables must fail for an authenticated user.
