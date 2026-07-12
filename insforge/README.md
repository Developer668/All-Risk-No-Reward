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
- A recovery lock that prevents the next challenge from loading.
- Durable notification-outbox events for unlocks and recovery changes.
- Five-per-10-minute and 20-per-24-hour AI proof rate limits.
- AI consent, age-confirmation, terms, privacy, boundaries, and category settings.
- Safety reports that replace an open challenge and exclude the reported
  challenge from that user's future selection.
- Immediate app-data erasure plus an account-deletion queue for the remaining
  InsForge Auth account.
- All eight frontend challenges and three private, safety-reviewed recovery levels.

No backend code sends a message, controls a social account, impersonates a user,
or publishes proof. An optional image is sent ephemerally to NVIDIA; only its
SHA-256 hash, media type, byte count, and user-provided filename are retained.

## Deploy

Use the CLI through `npx`; do not install it globally.

```bash
npx @insforge/cli login
npx @insforge/cli link
npx @insforge/cli current
npx @insforge/cli metadata --json
npx @insforge/cli db import insforge/schema.sql
```

The edge runtime needs these values:

| Secret | Required | Purpose |
|---|---:|---|
| `INSFORGE_BASE_URL` | yes | Project base URL, such as `https://APP.REGION.insforge.app` |
| `INSFORGE_API_KEY` | yes | Project-admin key used only inside trusted functions |
| `NVIDIA_API_KEY` | yes | NVIDIA NIM API key |
| `NVIDIA_PROOF_MODEL` | no | Defaults to `meta/llama-3.2-90b-vision-instruct` |
| `ALLOWED_ORIGINS` | yes in production | Comma-separated exact web origins; no paths or wildcards |
| `DAILY_MAINTENANCE_SECRET` | yes | Independent random bearer secret for the schedule |

`INSFORGE_BASE_URL` and `INSFORGE_API_KEY` may already be reserved/injected by
the project runtime. Confirm that before adding duplicates. Add the application
secrets with the CLI (values below are placeholders):

```bash
npx @insforge/cli secrets add NVIDIA_API_KEY YOUR_NVIDIA_KEY
npx @insforge/cli secrets add NVIDIA_PROOF_MODEL meta/llama-3.2-90b-vision-instruct
npx @insforge/cli secrets add ALLOWED_ORIGINS https://your-site.example
npx @insforge/cli secrets add DAILY_MAINTENANCE_SECRET REPLACE_WITH_64_RANDOM_HEX_CHARACTERS
npx @insforge/cli functions deploy verify-proof
npx @insforge/cli functions deploy daily-maintenance
```

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
Boundary tags are `direct-message`, `voice-message`, `invitation`, and
`vulnerability`; challenges with any disabled tag are excluded server-side.

### Verify proof

Invoke the edge function, not the completion table:

```ts
await insforge.functions.invoke('verify-proof', {
  body: {
    assignmentId,
    proofNote,
    imageDataUrl, // optional PNG/JPEG/WebP data URL, decoded size <= 180 KiB
    proofName,    // optional display name only
  },
})
```

The function authenticates the bearer token, loads the owned assignment and
catalog prompt, reserves a rate-limited attempt, calls NVIDIA, and records the
result through the project-admin-only `record_verified_completion` RPC. The
client cannot provide a challenge prompt, score, verdict, points, or user ID.
Server scoring matches the product contract: a score of 72–100 awards 120 total
assignment points, 25–71 awards 60 total assignment points, and 0–24 awards 0.
Upgrading a partial result to complete awards only the remaining 60, preventing
repeat submissions from farming points.

### Complete recovery

```ts
const { data } = await insforge.database.rpc('complete_recovery_task', {
  p_recovery_id: recoveryId,
  p_completion_note: 'A short, concrete private reflection on what I did.',
})
```

The note must be 12–1000 characters. The response is the refreshed daily state.

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
