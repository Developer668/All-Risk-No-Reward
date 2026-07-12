-- All Risk, No Reward — production InsForge schema
--
-- Import with:
--   npx @insforge/cli db import insforge/schema.sql
--
-- This migration is intentionally rerunnable. Progression writes are performed
-- only by SECURITY DEFINER RPCs; authenticated clients receive read-only table
-- access and cannot award themselves points, scores, assignments, or recoveries.

BEGIN;

-- ---------------------------------------------------------------------------
-- Core data
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
  level SMALLINT NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 5),
  streak INTEGER NOT NULL DEFAULT 0 CHECK (streak >= 0),
  courage_points INTEGER NOT NULL DEFAULT 0 CHECK (courage_points >= 0),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  notification_hour_start SMALLINT NOT NULL DEFAULT 9 CHECK (notification_hour_start BETWEEN 0 AND 23),
  notification_hour_end SMALLINT NOT NULL DEFAULT 19 CHECK (notification_hour_end BETWEEN 1 AND 23),
  boundaries JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS disabled_categories TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS disabled_boundary_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS unlock_window_start TIME NOT NULL DEFAULT TIME '10:00';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS unlock_window_end TIME NOT NULL DEFAULT TIME '18:00';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deadline_time TIME NOT NULL DEFAULT TIME '22:00';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS morning_reminder_time TIME NOT NULL DEFAULT TIME '08:00';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS morning_reminder_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS unlock_reminder_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS deadline_reminder_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS max_difficulty SMALLINT NOT NULL DEFAULT 3;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_max_difficulty_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_max_difficulty_check CHECK (max_difficulty BETWEEN 1 AND 5);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS proof_ai_consent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS minimum_age_confirmed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS accepted_terms_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS privacy_acknowledged_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS maintenance_checked_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS challenge_catalog (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  why TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty SMALLINT NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  estimated_minutes SMALLINT NOT NULL,
  proof_hint TEXT NOT NULL,
  suggested_script TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  safety_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE challenge_catalog ADD COLUMN IF NOT EXISTS safety_notes TEXT NOT NULL DEFAULT
  'Voluntary, legal, private by default, and never requires harassment, impersonation, coercion, or automated messaging.';
ALTER TABLE challenge_catalog ADD COLUMN IF NOT EXISTS boundary_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE challenge_catalog ADD COLUMN IF NOT EXISTS source_data JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE challenge_catalog ADD COLUMN IF NOT EXISTS dataset_version TEXT;
ALTER TABLE challenge_catalog DROP CONSTRAINT IF EXISTS challenge_catalog_category_check;
ALTER TABLE challenge_catalog ADD CONSTRAINT challenge_catalog_category_check CHECK (category IN (
  'coding', 'comedy', 'cooking', 'creative', 'fitness', 'kindness', 'outdoors',
  'productivity', 'skill', 'social', 'wellness',
  'warm-up', 'conversation', 'assertiveness', 'connection'
));
ALTER TABLE challenge_catalog DROP CONSTRAINT IF EXISTS challenge_catalog_estimated_minutes_check;
ALTER TABLE challenge_catalog ADD CONSTRAINT challenge_catalog_estimated_minutes_check
  CHECK (estimated_minutes BETWEEN 1 AND 1440);

CREATE TABLE IF NOT EXISTS recovery_catalog (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  difficulty SMALLINT NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  estimated_minutes SMALLINT NOT NULL CHECK (estimated_minutes BETWEEN 1 AND 120),
  is_active BOOLEAN NOT NULL DEFAULT true,
  private_only BOOLEAN NOT NULL DEFAULT true,
  safety_notes TEXT NOT NULL,
  safety_reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL REFERENCES challenge_catalog(id),
  assignment_date DATE NOT NULL,
  unlock_at TIMESTAMPTZ NOT NULL,
  deadline_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'active', 'partial', 'complete', 'missed', 'replaced')),
  completion_score SMALLINT CHECK (completion_score BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, assignment_date)
);

ALTER TABLE daily_assignments ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
ALTER TABLE daily_assignments ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE daily_assignments ADD COLUMN IF NOT EXISTS missed_at TIMESTAMPTZ;
ALTER TABLE daily_assignments ADD COLUMN IF NOT EXISTS points_awarded INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS proof_verification_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES daily_assignments(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'accepted', 'failed')),
  provider TEXT NOT NULL DEFAULT 'google-gemini',
  score SMALLINT CHECK (score BETWEEN 0 AND 100),
  failure_code TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CHECK (failure_code IS NULL OR char_length(failure_code) <= 80)
);

CREATE TABLE IF NOT EXISTS challenge_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES daily_assignments(id) ON DELETE SET NULL,
  challenge_id TEXT NOT NULL REFERENCES challenge_catalog(id),
  score SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
  note TEXT NOT NULL CHECK (char_length(note) <= 4000),
  proof_name TEXT,
  proof_url TEXT,
  proof_key TEXT,
  ai_feedback TEXT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE challenge_completions ADD COLUMN IF NOT EXISTS verification_attempt_id UUID REFERENCES proof_verification_attempts(id) ON DELETE SET NULL;
ALTER TABLE challenge_completions ADD COLUMN IF NOT EXISTS verdict TEXT CHECK (verdict IS NULL OR verdict IN ('complete', 'partial', 'needs-more'));
ALTER TABLE challenge_completions ADD COLUMN IF NOT EXISTS points_awarded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE challenge_completions ADD COLUMN IF NOT EXISTS proof_sha256 TEXT;
ALTER TABLE challenge_completions ADD COLUMN IF NOT EXISTS proof_media_type TEXT;
ALTER TABLE challenge_completions ADD COLUMN IF NOT EXISTS proof_size_bytes INTEGER;
ALTER TABLE proof_verification_attempts ALTER COLUMN provider SET DEFAULT 'google-gemini';
ALTER TABLE challenge_completions DROP CONSTRAINT IF EXISTS challenge_completions_proof_size_bytes_check;
ALTER TABLE challenge_completions ADD CONSTRAINT challenge_completions_proof_size_bytes_check
  CHECK (proof_size_bytes IS NULL OR proof_size_bytes BETWEEN 0 AND 5242880);

CREATE TABLE IF NOT EXISTS recovery_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_assignment_id UUID NOT NULL REFERENCES daily_assignments(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  difficulty SMALLINT NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'complete', 'waived')),
  due_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE recovery_tasks ADD COLUMN IF NOT EXISTS catalog_id TEXT REFERENCES recovery_catalog(id);
ALTER TABLE recovery_tasks ADD COLUMN IF NOT EXISTS escalation_level SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE recovery_tasks ADD COLUMN IF NOT EXISTS last_escalated_at TIMESTAMPTZ;
ALTER TABLE recovery_tasks ADD COLUMN IF NOT EXISTS completion_note TEXT;
ALTER TABLE recovery_tasks ADD COLUMN IF NOT EXISTS reroll_count SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE recovery_tasks DROP CONSTRAINT IF EXISTS recovery_tasks_reroll_count_check;
ALTER TABLE recovery_tasks ADD CONSTRAINT recovery_tasks_reroll_count_check
  CHECK (reroll_count BETWEEN 0 AND 2);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('morning-reminder', 'challenge-unlocked', 'deadline-reminder', 'recovery-created', 'recovery-escalated', 'recovery-complete')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_key)
);

-- Expand the original notification-kind check on existing installations.
ALTER TABLE notification_outbox DROP CONSTRAINT IF EXISTS notification_outbox_kind_check;
ALTER TABLE notification_outbox ADD CONSTRAINT notification_outbox_kind_check CHECK (
  kind IN (
    'morning-reminder', 'challenge-unlocked', 'deadline-reminder',
    'recovery-created', 'recovery-escalated', 'recovery-complete'
  )
);

-- Kept after app-data erasure so an administrator can finish deleting the auth
-- account. It contains only the opaque auth UUID and lifecycle timestamps.
CREATE TABLE IF NOT EXISTS account_deletion_requests (
  user_id UUID PRIMARY KEY,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed'))
);

CREATE TABLE IF NOT EXISTS challenge_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES daily_assignments(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL REFERENCES challenge_catalog(id),
  reason TEXT NOT NULL CHECK (reason IN ('crosses-boundary', 'unsafe', 'inappropriate', 'not-accessible', 'other')),
  details TEXT NOT NULL DEFAULT '' CHECK (char_length(details) <= 1000),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, assignment_id)
);

-- Immutable per-user assignment history. Catalog text is snapshotted so an
-- audit remains understandable even if an administrator later edits a catalog
-- row. All writes go through SECURITY DEFINER orchestration routines.
CREATE TABLE IF NOT EXISTS recovery_assignment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recovery_task_id UUID NOT NULL REFERENCES recovery_tasks(id) ON DELETE CASCADE,
  catalog_id TEXT NOT NULL REFERENCES recovery_catalog(id),
  previous_catalog_id TEXT REFERENCES recovery_catalog(id),
  assignment_kind TEXT NOT NULL CHECK (assignment_kind IN ('initial', 'reroll', 'escalation')),
  assignment_sequence INTEGER NOT NULL CHECK (assignment_sequence >= 0),
  reroll_number SMALLINT NOT NULL CHECK (reroll_number BETWEEN 0 AND 2),
  assigned_title TEXT NOT NULL,
  assigned_prompt TEXT NOT NULL,
  assigned_difficulty SMALLINT NOT NULL CHECK (assigned_difficulty BETWEEN 1 AND 5),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (recovery_task_id, assignment_sequence)
);

-- Existing installations may already have open or completed recovery rows.
-- Record their current catalog item so it is never selected by a future roll.
INSERT INTO recovery_assignment_history (
  user_id, recovery_task_id, catalog_id, previous_catalog_id, assignment_kind,
  assignment_sequence, reroll_number, assigned_title, assigned_prompt,
  assigned_difficulty, assigned_at
)
SELECT
  user_id, id, catalog_id, NULL, 'initial', 0, reroll_count, title, prompt,
  difficulty, created_at
FROM recovery_tasks
WHERE catalog_id IS NOT NULL
ON CONFLICT (recovery_task_id, assignment_sequence) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS daily_assignments_user_date_idx ON daily_assignments(user_id, assignment_date DESC);
CREATE INDEX IF NOT EXISTS daily_assignments_status_deadline_idx ON daily_assignments(status, deadline_at);
CREATE INDEX IF NOT EXISTS daily_assignments_status_unlock_idx ON daily_assignments(status, unlock_at);
CREATE INDEX IF NOT EXISTS challenge_completions_user_created_idx ON challenge_completions(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS challenge_completions_attempt_uidx
  ON challenge_completions(verification_attempt_id)
  WHERE verification_attempt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS proof_attempts_user_requested_idx ON proof_verification_attempts(user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS proof_attempts_assignment_idx ON proof_verification_attempts(assignment_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS recovery_tasks_user_status_idx ON recovery_tasks(user_id, status, due_at);
CREATE UNIQUE INDEX IF NOT EXISTS recovery_tasks_source_assignment_uidx ON recovery_tasks(source_assignment_id);
CREATE INDEX IF NOT EXISTS recovery_assignment_history_user_catalog_idx
  ON recovery_assignment_history(user_id, catalog_id);
CREATE INDEX IF NOT EXISTS recovery_assignment_history_task_sequence_idx
  ON recovery_assignment_history(recovery_task_id, assignment_sequence DESC);
CREATE INDEX IF NOT EXISTS notification_outbox_user_available_idx ON notification_outbox(user_id, available_at DESC);
CREATE INDEX IF NOT EXISTS profiles_maintenance_idx ON profiles(maintenance_checked_at NULLS FIRST);
CREATE INDEX IF NOT EXISTS challenge_reports_user_created_idx ON challenge_reports(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS challenge_reports_review_idx ON challenge_reports(review_status, created_at);

-- Keep reported assignments in history while allowing one replacement for the
-- same local date. The original prototype used a hard UNIQUE constraint.
ALTER TABLE daily_assignments
  DROP CONSTRAINT IF EXISTS daily_assignments_user_id_assignment_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS daily_assignments_current_user_date_uidx
  ON daily_assignments(user_id, assignment_date)
  WHERE status <> 'replaced';

-- challenge_catalog is populated by the generated repository seed after this
-- schema is imported. recovery_catalog remains operator-managed.

-- ---------------------------------------------------------------------------
-- Updated-at trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS assignments_updated_at ON daily_assignments;
CREATE TRIGGER assignments_updated_at
  BEFORE UPDATE ON daily_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Private orchestration helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._queue_notification(
  p_user_id UUID,
  p_event_key TEXT,
  p_kind TEXT,
  p_title TEXT,
  p_body TEXT,
  p_available_at TIMESTAMPTZ DEFAULT now()
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO notification_outbox (user_id, event_key, kind, title, body, available_at)
  VALUES (
    p_user_id,
    left(p_event_key, 180),
    p_kind,
    left(p_title, 160),
    left(p_body, 500),
    p_available_at
  )
  ON CONFLICT (user_id, event_key) DO NOTHING;
END;
$$;

-- Assign the first punishment for one partial or missed challenge. Keeping this
-- in one narrow helper makes the proof and deadline paths use the same
-- score-to-difficulty rules, no-repeat catalog selection, audit row, and
-- notification idempotency. The assignment row lock plus the unique source
-- index guarantee that concurrent proof/maintenance calls create at most one.
CREATE OR REPLACE FUNCTION public._create_recovery_for_assignment(
  p_user_id UUID,
  p_assignment_id UUID,
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS recovery_tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_assignment daily_assignments%ROWTYPE;
  v_recovery recovery_tasks%ROWTYPE;
  v_catalog recovery_catalog%ROWTYPE;
  v_initial_difficulty SMALLINT;
BEGIN
  SELECT * INTO v_assignment
    FROM daily_assignments
   WHERE id = p_assignment_id
     AND user_id = p_user_id
   FOR UPDATE;

  IF v_assignment.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_recovery
    FROM recovery_tasks
   WHERE source_assignment_id = v_assignment.id
   FOR UPDATE;

  IF v_recovery.id IS NOT NULL THEN
    RETURN v_recovery;
  END IF;

  v_initial_difficulty := CASE
    WHEN v_assignment.completion_score IS NULL THEN 3
    WHEN v_assignment.completion_score >= 60 THEN 1
    WHEN v_assignment.completion_score >= 25 THEN 2
    ELSE 3
  END;

  SELECT * INTO v_catalog
    FROM recovery_catalog
   WHERE is_active = true
     AND difficulty = v_initial_difficulty
     AND NOT EXISTS (
       SELECT 1 FROM recovery_assignment_history history
        WHERE history.user_id = p_user_id
          AND history.catalog_id = recovery_catalog.id
     )
     AND NOT EXISTS (
       SELECT 1 FROM recovery_tasks prior
        WHERE prior.user_id = p_user_id
          AND prior.catalog_id = recovery_catalog.id
     )
   ORDER BY md5(v_assignment.id::text || ':' || id)
   LIMIT 1;

  IF v_catalog.id IS NULL THEN
    SELECT * INTO v_catalog
      FROM recovery_catalog
     WHERE is_active = true
       AND NOT EXISTS (
         SELECT 1 FROM recovery_assignment_history history
          WHERE history.user_id = p_user_id
            AND history.catalog_id = recovery_catalog.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM recovery_tasks prior
          WHERE prior.user_id = p_user_id
            AND prior.catalog_id = recovery_catalog.id
       )
     ORDER BY abs(difficulty - v_initial_difficulty), difficulty, id
     LIMIT 1;
  END IF;

  -- An empty/exhausted operator catalog cannot produce a safe punishment. The
  -- partial result is still recorded; a later maintenance pass can retry after
  -- the operator adds reviewed content.
  IF v_catalog.id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO recovery_tasks (
    user_id, source_assignment_id, catalog_id, title, prompt, difficulty,
    due_at, escalation_level, last_escalated_at
  )
  VALUES (
    p_user_id, v_assignment.id, v_catalog.id, v_catalog.title,
    v_catalog.prompt, v_catalog.difficulty, p_now + interval '24 hours', 0, p_now
  )
  ON CONFLICT (source_assignment_id) DO NOTHING
  RETURNING * INTO v_recovery;

  IF v_recovery.id IS NULL THEN
    SELECT * INTO v_recovery
      FROM recovery_tasks
     WHERE source_assignment_id = v_assignment.id;
    RETURN v_recovery;
  END IF;

  INSERT INTO recovery_assignment_history (
    user_id, recovery_task_id, catalog_id, previous_catalog_id,
    assignment_kind, assignment_sequence, reroll_number, assigned_title,
    assigned_prompt, assigned_difficulty, assigned_at
  ) VALUES (
    p_user_id, v_recovery.id, v_catalog.id, NULL, 'initial', 0, 0,
    v_catalog.title, v_catalog.prompt, v_catalog.difficulty, p_now
  )
  ON CONFLICT (recovery_task_id, assignment_sequence) DO NOTHING;

  SELECT * INTO v_profile FROM profiles WHERE user_id = p_user_id;
  IF v_profile.notification_enabled THEN
    PERFORM public._queue_notification(
      p_user_id,
      'recovery-created:' || v_recovery.id::text,
      'recovery-created',
      CASE
        WHEN v_assignment.completion_score IS NOT NULL
          THEN 'Progress saved—close the loop'
        ELSE 'A reset is ready'
      END,
      'Complete the private recovery task before the next daily challenge.',
      p_now
    );
  END IF;

  RETURN v_recovery;
END;
$$;

CREATE OR REPLACE FUNCTION public._process_user_state(
  p_user_id UUID,
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_assignment daily_assignments%ROWTYPE;
  v_recovery recovery_tasks%ROWTYPE;
  v_catalog recovery_catalog%ROWTYPE;
  v_next_difficulty SMALLINT;
  v_previous_catalog_id TEXT;
  v_assignment_sequence INTEGER;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE user_id = p_user_id;
  IF v_profile.user_id IS NULL THEN
    RETURN;
  END IF;

  IF v_profile.notification_enabled AND v_profile.morning_reminder_enabled THEN
    FOR v_assignment IN
      SELECT *
        FROM daily_assignments
       WHERE user_id = p_user_id
         AND status IN ('locked', 'active', 'partial')
         AND p_now >= (
           assignment_date + v_profile.morning_reminder_time
         ) AT TIME ZONE v_profile.timezone
         AND p_now <= deadline_at
    LOOP
      PERFORM public._queue_notification(
        p_user_id,
        'morning-reminder:' || v_assignment.id::text,
        'morning-reminder',
        'A courage challenge is coming',
        'Today''s challenge will appear inside your chosen unlock window.',
        p_now
      );
    END LOOP;
  END IF;

  IF v_profile.notification_enabled AND v_profile.deadline_reminder_enabled THEN
    FOR v_assignment IN
      SELECT *
        FROM daily_assignments
       WHERE user_id = p_user_id
         AND status IN ('active', 'partial')
         AND p_now >= deadline_at - interval '1 hour'
         AND p_now <= deadline_at
    LOOP
      PERFORM public._queue_notification(
        p_user_id,
        'deadline-reminder:' || v_assignment.id::text,
        'deadline-reminder',
        'One hour left',
        'Submit your privacy-safe progress before today''s deadline.',
        p_now
      );
    END LOOP;
  END IF;

  -- Unlock due assignments and create a durable notification event. The web app
  -- can show this as an in-app item and, with permission, a browser notification.
  FOR v_assignment IN
    UPDATE daily_assignments
       SET status = 'active',
           activated_at = COALESCE(activated_at, p_now)
     WHERE user_id = p_user_id
       AND status = 'locked'
       AND unlock_at <= p_now
       AND deadline_at >= p_now
     RETURNING *
  LOOP
    IF v_profile.notification_enabled AND v_profile.unlock_reminder_enabled THEN
      PERFORM public._queue_notification(
        p_user_id,
        'challenge-unlocked:' || v_assignment.id::text,
        'challenge-unlocked',
        'Today''s challenge is unlocked',
        'Open All Risk, No Reward to see today''s challenge.',
        p_now
      );
    END IF;
  END LOOP;

  -- A deadline miss creates exactly one recovery. Partial proof calls the same
  -- helper immediately from record_verified_completion rather than waiting for
  -- this maintenance path.
  FOR v_assignment IN
    UPDATE daily_assignments
       SET status = 'missed',
           missed_at = COALESCE(missed_at, p_now)
     WHERE user_id = p_user_id
       AND status IN ('locked', 'active', 'partial')
       AND deadline_at < p_now
     RETURNING *
  LOOP
    UPDATE profiles SET streak = 0 WHERE user_id = p_user_id;
  END LOOP;

  -- This also retries an earlier partial/miss if the operator catalog was empty
  -- when it was first recorded. Existing recoveries are excluded before the
  -- helper is called, so a retry cannot add another history row or event.
  FOR v_assignment IN
    SELECT assignment.*
      FROM daily_assignments assignment
     WHERE assignment.user_id = p_user_id
       AND assignment.status IN ('partial', 'missed')
       AND NOT EXISTS (
         SELECT 1 FROM recovery_tasks recovery
          WHERE recovery.source_assignment_id = assignment.id
       )
     ORDER BY assignment.assignment_date, assignment.created_at
     FOR UPDATE
  LOOP
    v_recovery := public._create_recovery_for_assignment(
      p_user_id,
      v_assignment.id,
      p_now
    );
    UPDATE profiles SET streak = 0 WHERE user_id = p_user_id;
  END LOOP;

  -- Escalate at most once per due interval and only through active,
  -- operator-reviewed catalog content. Difficulty five is the schema maximum.
  FOR v_recovery IN
    SELECT *
      FROM recovery_tasks
     WHERE user_id = p_user_id
       AND status = 'open'
       AND due_at < p_now
     ORDER BY due_at
     FOR UPDATE
  LOOP
    v_next_difficulty := LEAST(5, v_recovery.difficulty + 1);
    v_previous_catalog_id := v_recovery.catalog_id;

    SELECT * INTO v_catalog
      FROM recovery_catalog
     WHERE is_active = true
       AND difficulty = v_next_difficulty
       AND NOT EXISTS (
         SELECT 1 FROM recovery_assignment_history history
          WHERE history.user_id = p_user_id
            AND history.catalog_id = recovery_catalog.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM recovery_tasks prior
          WHERE prior.user_id = p_user_id
            AND prior.catalog_id = recovery_catalog.id
       )
     ORDER BY md5(v_recovery.id::text || ':' || (v_recovery.escalation_level + 1)::text || ':' || id)
     LIMIT 1;

    IF v_catalog.id IS NOT NULL THEN
      UPDATE recovery_tasks
         SET catalog_id = v_catalog.id,
             title = v_catalog.title,
             prompt = v_catalog.prompt,
             difficulty = v_catalog.difficulty,
             escalation_level = LEAST(32767, escalation_level + 1),
             last_escalated_at = p_now,
             due_at = p_now + interval '24 hours'
       WHERE id = v_recovery.id
       RETURNING * INTO v_recovery;

      SELECT COALESCE(max(assignment_sequence), -1) + 1
        INTO v_assignment_sequence
        FROM recovery_assignment_history
       WHERE recovery_task_id = v_recovery.id;

      INSERT INTO recovery_assignment_history (
        user_id, recovery_task_id, catalog_id, previous_catalog_id,
        assignment_kind, assignment_sequence, reroll_number, assigned_title,
        assigned_prompt, assigned_difficulty, assigned_at
      ) VALUES (
        p_user_id, v_recovery.id, v_catalog.id, v_previous_catalog_id,
        'escalation', v_assignment_sequence, v_recovery.reroll_count,
        v_catalog.title, v_catalog.prompt, v_catalog.difficulty, p_now
      );

      IF v_profile.notification_enabled THEN
        PERFORM public._queue_notification(
          p_user_id,
          'recovery-escalated:' || v_recovery.id::text || ':' || v_recovery.escalation_level::text,
          'recovery-escalated',
          'Your recovery task stepped up',
          'The next challenge stays paused until this safe recovery task is complete.',
          p_now
        );
      END IF;
    ELSE
      UPDATE recovery_tasks
         SET due_at = p_now + interval '24 hours',
             last_escalated_at = p_now
       WHERE id = v_recovery.id;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public._ensure_assignment_for(
  p_user_id UUID,
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS daily_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_assignment daily_assignments%ROWTYPE;
  v_challenge challenge_catalog%ROWTYPE;
  v_today DATE;
  v_local_date DATE;
  v_local_time TIME;
  v_unlock_local TIMESTAMP;
  v_deadline_local TIMESTAMP;
  v_unlock_at TIMESTAMPTZ;
  v_deadline_at TIMESTAMPTZ;
  v_window_minutes INTEGER;
  v_offset_minutes INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM account_deletion_requests
     WHERE user_id = p_user_id AND status = 'pending'
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO profiles (user_id, display_name)
  VALUES (p_user_id, 'Courageous human')
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_profile
    FROM profiles
   WHERE user_id = p_user_id
   FOR UPDATE;

  v_today := (p_now AT TIME ZONE v_profile.timezone)::date;
  v_local_time := (p_now AT TIME ZONE v_profile.timezone)::time;
  v_local_date := v_today;

  SELECT * INTO v_assignment
    FROM daily_assignments
   WHERE user_id = p_user_id
     AND assignment_date = v_today
     AND status <> 'replaced';

  IF v_assignment.id IS NOT NULL THEN
    RETURN v_assignment;
  END IF;

  -- A new user arriving after today's deadline receives tomorrow's locked
  -- assignment rather than an immediately missed challenge.
  IF v_local_time >= v_profile.deadline_time THEN
    v_local_date := v_today + 1;
    SELECT * INTO v_assignment
      FROM daily_assignments
     WHERE user_id = p_user_id
       AND assignment_date = v_local_date
       AND status <> 'replaced';
    IF v_assignment.id IS NOT NULL THEN
      RETURN v_assignment;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM recovery_tasks
     WHERE user_id = p_user_id AND status = 'open'
  ) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_challenge
    FROM challenge_catalog
   WHERE is_active = true
     AND difficulty <= LEAST(5, v_profile.level + 1, v_profile.max_difficulty)
     AND NOT (category = ANY(v_profile.disabled_categories))
     AND NOT (challenge_catalog.boundary_tags && v_profile.disabled_boundary_tags)
     AND NOT EXISTS (
       SELECT 1 FROM challenge_reports
        WHERE user_id = p_user_id
          AND challenge_id = challenge_catalog.id
     )
   ORDER BY md5(p_user_id::text || ':' || v_local_date::text || ':' || id)
   LIMIT 1;

  IF v_challenge.id IS NULL THEN
    RETURN NULL;
  END IF;

  v_window_minutes := GREATEST(
    1,
    (extract(epoch FROM (v_profile.unlock_window_end - v_profile.unlock_window_start)) / 60)::integer
  );
  v_offset_minutes := (
    ('x' || substr(md5(p_user_id::text || ':' || v_local_date::text || ':unlock'), 1, 8))::bit(32)::bigint
    % v_window_minutes
  )::integer;

  v_unlock_local := v_local_date + v_profile.unlock_window_start
    + make_interval(mins => v_offset_minutes);
  v_deadline_local := v_local_date + v_profile.deadline_time;
  v_unlock_at := v_unlock_local AT TIME ZONE v_profile.timezone;
  v_deadline_at := v_deadline_local AT TIME ZONE v_profile.timezone;

  INSERT INTO daily_assignments (
    user_id, challenge_id, assignment_date, unlock_at, deadline_at, status,
    activated_at
  )
  VALUES (
    p_user_id,
    v_challenge.id,
    v_local_date,
    v_unlock_at,
    v_deadline_at,
    CASE WHEN p_now >= v_unlock_at THEN 'active' ELSE 'locked' END,
    CASE WHEN p_now >= v_unlock_at THEN p_now ELSE NULL END
  )
  ON CONFLICT (user_id, assignment_date) WHERE status <> 'replaced' DO UPDATE
    SET updated_at = daily_assignments.updated_at
  RETURNING * INTO v_assignment;

  IF v_assignment.status = 'active'
     AND v_profile.notification_enabled
     AND v_profile.unlock_reminder_enabled THEN
    PERFORM public._queue_notification(
      p_user_id,
      'challenge-unlocked:' || v_assignment.id::text,
      'challenge-unlocked',
      'Today''s challenge is unlocked',
      'Open All Risk, No Reward to see today''s challenge.',
      p_now
    );
  END IF;

  RETURN v_assignment;
END;
$$;

-- ---------------------------------------------------------------------------
-- Authenticated RPC surface
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_daily_assignment()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_assignment daily_assignments%ROWTYPE;
  v_challenge challenge_catalog%ROWTYPE;
  v_recovery recovery_tasks%ROWTYPE;
  v_profile profiles%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'AUTH_REQUIRED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM account_deletion_requests
     WHERE user_id = v_user_id AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object(
      'blocked', true,
      'reason', 'account-deletion-pending',
      'assignment', NULL,
      'challenge', NULL,
      'recovery', NULL
    );
  END IF;

  INSERT INTO profiles (user_id, display_name)
  VALUES (v_user_id, 'Courageous human')
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM public._process_user_state(v_user_id, now());

  SELECT * INTO v_recovery
    FROM recovery_tasks
   WHERE user_id = v_user_id AND status = 'open'
   ORDER BY created_at
   LIMIT 1;

  SELECT * INTO v_profile FROM profiles WHERE user_id = v_user_id;

  IF v_recovery.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'blocked', true,
      'reason', 'recovery-required',
      'assignment', NULL,
      'challenge', NULL,
      'recovery', to_jsonb(v_recovery),
      'profile', to_jsonb(v_profile) - 'maintenance_checked_at'
    );
  END IF;

  v_assignment := public._ensure_assignment_for(v_user_id, now());

  IF v_assignment.id IS NULL THEN
    RETURN jsonb_build_object(
      'blocked', true,
      'reason', 'no-eligible-challenge',
      'assignment', NULL,
      'challenge', NULL,
      'recovery', NULL,
      'profile', to_jsonb(v_profile) - 'maintenance_checked_at'
    );
  END IF;

  IF v_assignment.status <> 'locked' THEN
    SELECT * INTO v_challenge FROM challenge_catalog WHERE id = v_assignment.challenge_id;
  END IF;

  RETURN jsonb_build_object(
    'blocked', false,
    'reason', CASE WHEN v_assignment.status = 'locked' THEN 'challenge-locked' ELSE NULL END,
    'assignment', to_jsonb(v_assignment),
    'challenge', CASE WHEN v_challenge.id IS NULL THEN NULL ELSE to_jsonb(v_challenge) END,
    'recovery', NULL,
    'profile', to_jsonb(v_profile) - 'maintenance_checked_at'
  );
END;
$$;

DROP FUNCTION IF EXISTS public.update_profile_preferences(
  TEXT, TEXT, BOOLEAN, SMALLINT, SMALLINT, JSONB, TEXT[], BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN
);
DROP FUNCTION IF EXISTS public.update_profile_preferences(
  TEXT, TEXT, BOOLEAN, SMALLINT, SMALLINT, JSONB, TEXT[], TEXT[], BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN
);

CREATE OR REPLACE FUNCTION public.update_profile_preferences(
  p_display_name TEXT DEFAULT NULL,
  p_timezone TEXT DEFAULT NULL,
  p_notification_enabled BOOLEAN DEFAULT NULL,
  p_notification_hour_start SMALLINT DEFAULT NULL,
  p_notification_hour_end SMALLINT DEFAULT NULL,
  p_unlock_window_start TEXT DEFAULT NULL,
  p_unlock_window_end TEXT DEFAULT NULL,
  p_deadline_time TEXT DEFAULT NULL,
  p_morning_reminder_time TEXT DEFAULT NULL,
  p_morning_reminder_enabled BOOLEAN DEFAULT NULL,
  p_unlock_reminder_enabled BOOLEAN DEFAULT NULL,
  p_deadline_reminder_enabled BOOLEAN DEFAULT NULL,
  p_max_difficulty SMALLINT DEFAULT NULL,
  p_boundaries JSONB DEFAULT NULL,
  p_disabled_categories TEXT[] DEFAULT NULL,
  p_disabled_boundary_tags TEXT[] DEFAULT NULL,
  p_proof_ai_consent BOOLEAN DEFAULT NULL,
  p_minimum_age_confirmed BOOLEAN DEFAULT NULL,
  p_accept_terms BOOLEAN DEFAULT NULL,
  p_acknowledge_privacy BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile profiles%ROWTYPE;
  v_start SMALLINT;
  v_end SMALLINT;
  v_unlock_start TIME;
  v_unlock_end TIME;
  v_deadline TIME;
  v_morning TIME;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'AUTH_REQUIRED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM account_deletion_requests
     WHERE user_id = v_user_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACCOUNT_DELETION_PENDING';
  END IF;

  INSERT INTO profiles (user_id, display_name)
  VALUES (v_user_id, 'Courageous human')
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_profile FROM profiles WHERE user_id = v_user_id FOR UPDATE;

  IF p_display_name IS NOT NULL AND char_length(btrim(p_display_name)) NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_DISPLAY_NAME';
  END IF;

  IF p_timezone IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = p_timezone
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_TIMEZONE';
  END IF;

  v_start := COALESCE(p_notification_hour_start, v_profile.notification_hour_start);
  v_end := COALESCE(p_notification_hour_end, v_profile.notification_hour_end);
  IF v_start < 6 OR v_start > 18 OR v_end < 7 OR v_end > 19 OR v_end <= v_start THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_NOTIFICATION_WINDOW';
  END IF;

  IF (p_unlock_window_start IS NOT NULL AND p_unlock_window_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
     OR (p_unlock_window_end IS NOT NULL AND p_unlock_window_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
     OR (p_deadline_time IS NOT NULL AND p_deadline_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
     OR (p_morning_reminder_time IS NOT NULL AND p_morning_reminder_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_SCHEDULE_TIME';
  END IF;

  v_unlock_start := CASE
    WHEN p_unlock_window_start IS NOT NULL THEN p_unlock_window_start::time
    WHEN p_notification_hour_start IS NOT NULL THEN make_time(v_start, 0, 0)
    ELSE v_profile.unlock_window_start
  END;
  v_unlock_end := CASE
    WHEN p_unlock_window_end IS NOT NULL THEN p_unlock_window_end::time
    WHEN p_notification_hour_end IS NOT NULL THEN make_time(v_end, 0, 0)
    ELSE v_profile.unlock_window_end
  END;
  v_deadline := COALESCE(p_deadline_time::time, v_profile.deadline_time);
  v_morning := COALESCE(p_morning_reminder_time::time, v_profile.morning_reminder_time);

  IF v_unlock_start < TIME '06:00'
     OR v_unlock_end > TIME '19:00'
     OR v_unlock_start >= v_unlock_end
     OR v_deadline <= v_unlock_end
     OR v_morning > v_unlock_start THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_SCHEDULE_ORDER';
  END IF;

  IF p_max_difficulty IS NOT NULL AND p_max_difficulty NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_MAX_DIFFICULTY';
  END IF;

  IF p_boundaries IS NOT NULL AND (
    jsonb_typeof(p_boundaries) <> 'array'
    OR jsonb_array_length(p_boundaries) > 25
    OR octet_length(p_boundaries::text) > 4000
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_BOUNDARIES';
  END IF;

  IF p_disabled_categories IS NOT NULL AND (
    COALESCE(array_length(p_disabled_categories, 1), 0) > 15
    OR EXISTS (
      SELECT 1 FROM unnest(p_disabled_categories) AS category
       WHERE category NOT IN (
         'coding', 'comedy', 'cooking', 'creative', 'fitness', 'kindness',
         'outdoors', 'productivity', 'skill', 'social', 'wellness',
         'warm-up', 'conversation', 'assertiveness', 'connection'
       )
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_DISABLED_CATEGORIES';
  END IF;

  IF p_disabled_boundary_tags IS NOT NULL AND (
    COALESCE(array_length(p_disabled_boundary_tags, 1), 0) > 8
    OR EXISTS (
      SELECT 1 FROM unnest(p_disabled_boundary_tags) AS boundary_tag
       WHERE boundary_tag NOT IN (
         'direct-message', 'voice-message', 'invitation', 'vulnerability',
         'requires-consent', 'group-activity', 'social-platform', 'physical-activity'
       )
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_DISABLED_BOUNDARY_TAGS';
  END IF;

  UPDATE profiles
     SET display_name = COALESCE(NULLIF(btrim(p_display_name), ''), display_name),
         timezone = COALESCE(p_timezone, timezone),
         notification_enabled = COALESCE(p_notification_enabled, notification_enabled),
         notification_hour_start = extract(hour FROM v_unlock_start)::smallint,
         notification_hour_end = extract(hour FROM v_unlock_end)::smallint,
         unlock_window_start = v_unlock_start,
         unlock_window_end = v_unlock_end,
         deadline_time = v_deadline,
         morning_reminder_time = v_morning,
         morning_reminder_enabled = COALESCE(p_morning_reminder_enabled, morning_reminder_enabled),
         unlock_reminder_enabled = COALESCE(p_unlock_reminder_enabled, unlock_reminder_enabled),
         deadline_reminder_enabled = COALESCE(p_deadline_reminder_enabled, deadline_reminder_enabled),
         max_difficulty = COALESCE(p_max_difficulty, max_difficulty),
         boundaries = COALESCE(p_boundaries, boundaries),
         disabled_categories = CASE
           WHEN p_disabled_categories IS NULL THEN disabled_categories
           ELSE ARRAY(SELECT DISTINCT category FROM unnest(p_disabled_categories) AS category ORDER BY category)
         END,
         disabled_boundary_tags = CASE
           WHEN p_disabled_boundary_tags IS NULL THEN disabled_boundary_tags
           ELSE ARRAY(
             SELECT DISTINCT boundary_tag
               FROM unnest(p_disabled_boundary_tags) AS boundary_tag
              ORDER BY boundary_tag
           )
         END,
         proof_ai_consent = COALESCE(p_proof_ai_consent, proof_ai_consent),
         minimum_age_confirmed = CASE
           WHEN p_minimum_age_confirmed = true THEN true
           ELSE minimum_age_confirmed
         END,
         accepted_terms_at = CASE
           WHEN p_accept_terms = true THEN COALESCE(accepted_terms_at, now())
           ELSE accepted_terms_at
         END,
         privacy_acknowledged_at = CASE
           WHEN p_acknowledge_privacy = true THEN COALESCE(privacy_acknowledged_at, now())
           ELSE privacy_acknowledged_at
         END
   WHERE user_id = v_user_id
   RETURNING * INTO v_profile;

  RETURN to_jsonb(v_profile) - 'maintenance_checked_at';
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_proof_verification(p_assignment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_assignment daily_assignments%ROWTYPE;
  v_attempt proof_verification_attempts%ROWTYPE;
  v_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'AUTH_REQUIRED';
  END IF;

  PERFORM public._process_user_state(v_user_id, now());

  IF NOT EXISTS (
    SELECT 1 FROM profiles
     WHERE user_id = v_user_id AND proof_ai_consent = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AI_PROOF_CONSENT_REQUIRED';
  END IF;

  SELECT * INTO v_assignment
    FROM daily_assignments
   WHERE id = p_assignment_id
     AND user_id = v_user_id
   FOR UPDATE;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNMENT_NOT_FOUND';
  END IF;
  IF v_assignment.status = 'locked' OR v_assignment.unlock_at > now() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNMENT_LOCKED';
  END IF;
  IF v_assignment.status IN ('missed', 'replaced') OR v_assignment.deadline_at < now() THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNMENT_CLOSED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM recovery_tasks WHERE user_id = v_user_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RECOVERY_REQUIRED';
  END IF;

  SELECT count(*) INTO v_count
    FROM proof_verification_attempts
   WHERE user_id = v_user_id
     AND requested_at >= now() - interval '10 minutes';
  IF v_count >= 5 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PROOF_RATE_LIMIT_10_MINUTES';
  END IF;

  SELECT count(*) INTO v_count
    FROM proof_verification_attempts
   WHERE user_id = v_user_id
     AND requested_at >= now() - interval '24 hours';
  IF v_count >= 20 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PROOF_RATE_LIMIT_24_HOURS';
  END IF;

  IF EXISTS (
    SELECT 1 FROM proof_verification_attempts
     WHERE user_id = v_user_id
       AND requested_at >= now() - interval '5 seconds'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PROOF_RATE_LIMIT_RETRY_LATER';
  END IF;

  INSERT INTO proof_verification_attempts (user_id, assignment_id)
  VALUES (v_user_id, v_assignment.id)
  RETURNING * INTO v_attempt;

  RETURN jsonb_build_object(
    'attemptId', v_attempt.id,
    'assignmentId', v_attempt.assignment_id,
    'reservedAt', v_attempt.requested_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.report_challenge(
  p_assignment_id UUID,
  p_reason TEXT,
  p_details TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_assignment daily_assignments%ROWTYPE;
  v_report challenge_reports%ROWTYPE;
  v_state JSONB;
  v_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'AUTH_REQUIRED';
  END IF;
  IF p_reason NOT IN ('crosses-boundary', 'unsafe', 'inappropriate', 'not-accessible', 'other') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_REPORT_REASON';
  END IF;
  IF char_length(COALESCE(p_details, '')) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REPORT_DETAILS_TOO_LONG';
  END IF;

  SELECT * INTO v_assignment
    FROM daily_assignments
   WHERE id = p_assignment_id
     AND user_id = v_user_id
   FOR UPDATE;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNMENT_NOT_FOUND';
  END IF;

  SELECT * INTO v_report
    FROM challenge_reports
   WHERE user_id = v_user_id
     AND assignment_id = v_assignment.id;
  IF v_report.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'report', to_jsonb(v_report),
      'state', public.ensure_daily_assignment(),
      'idempotent', true
    );
  END IF;

  IF v_assignment.status NOT IN ('locked', 'active') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNMENT_CANNOT_BE_REPORTED';
  END IF;

  SELECT count(*) INTO v_count
    FROM challenge_reports
   WHERE user_id = v_user_id
     AND created_at >= now() - interval '24 hours';
  IF v_count >= 10 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REPORT_RATE_LIMIT_24_HOURS';
  END IF;

  INSERT INTO challenge_reports (
    user_id, assignment_id, challenge_id, reason, details
  )
  VALUES (
    v_user_id, v_assignment.id, v_assignment.challenge_id, p_reason,
    btrim(COALESCE(p_details, ''))
  )
  RETURNING * INTO v_report;

  UPDATE daily_assignments
     SET status = 'replaced'
   WHERE id = v_assignment.id;

  -- The reported challenge is excluded from future selection for this user.
  -- Create a same-day replacement immediately when another reviewed challenge
  -- fits their level and boundaries.
  PERFORM public._ensure_assignment_for(v_user_id, now());
  v_state := public.ensure_daily_assignment();

  RETURN jsonb_build_object(
    'report', to_jsonb(v_report),
    'state', v_state,
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_recovery_task(
  p_recovery_id UUID,
  p_completion_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_recovery recovery_tasks%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'AUTH_REQUIRED';
  END IF;
  IF char_length(btrim(COALESCE(p_completion_note, ''))) NOT BETWEEN 12 AND 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'RECOVERY_NOTE_REQUIRED';
  END IF;

  SELECT * INTO v_recovery
    FROM recovery_tasks
   WHERE id = p_recovery_id AND user_id = v_user_id
   FOR UPDATE;

  IF v_recovery.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RECOVERY_NOT_FOUND';
  END IF;

  IF v_recovery.status = 'open' THEN
    UPDATE recovery_tasks
       SET status = 'complete',
           completed_at = now(),
           completion_note = btrim(p_completion_note)
     WHERE id = v_recovery.id
     RETURNING * INTO v_recovery;

    PERFORM public._queue_notification(
      v_user_id,
      'recovery-complete:' || v_recovery.id::text,
      'recovery-complete',
      'Recovery complete',
      'Your daily challenge flow is available again.',
      now()
    );
  END IF;

  RETURN public.ensure_daily_assignment();
END;
$$;

CREATE OR REPLACE FUNCTION public.reroll_recovery_task(p_recovery_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_recovery recovery_tasks%ROWTYPE;
  v_catalog recovery_catalog%ROWTYPE;
  v_previous_catalog_id TEXT;
  v_previous_difficulty SMALLINT;
  v_assignment_sequence INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'AUTH_REQUIRED';
  END IF;

  -- The row lock serializes two rapid clicks or requests from multiple tabs, so
  -- the two-roll allowance cannot be overspent.
  SELECT * INTO v_recovery
    FROM recovery_tasks
   WHERE id = p_recovery_id AND user_id = v_user_id
   FOR UPDATE;

  IF v_recovery.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RECOVERY_NOT_FOUND';
  END IF;
  IF v_recovery.status <> 'open' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RECOVERY_NOT_OPEN';
  END IF;
  IF v_recovery.reroll_count >= 2 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'RECOVERY_REROLL_LIMIT';
  END IF;

  -- Backfill the current assignment defensively for installations upgraded
  -- from a schema version that predated assignment history.
  IF v_recovery.catalog_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM recovery_assignment_history
     WHERE user_id = v_user_id AND catalog_id = v_recovery.catalog_id
  ) THEN
    SELECT COALESCE(max(assignment_sequence), -1) + 1
      INTO v_assignment_sequence
      FROM recovery_assignment_history
     WHERE recovery_task_id = v_recovery.id;

    INSERT INTO recovery_assignment_history (
      user_id, recovery_task_id, catalog_id, previous_catalog_id,
      assignment_kind, assignment_sequence, reroll_number, assigned_title,
      assigned_prompt, assigned_difficulty, assigned_at
    ) VALUES (
      v_user_id, v_recovery.id, v_recovery.catalog_id, NULL, 'initial',
      v_assignment_sequence, v_recovery.reroll_count, v_recovery.title,
      v_recovery.prompt, v_recovery.difficulty, v_recovery.created_at
    );
  END IF;

  -- random() gives every remaining active row equal weight. Difficulty is not
  -- part of the predicate: accepting a roll can make the task easier or harder.
  SELECT * INTO v_catalog
    FROM recovery_catalog
   WHERE is_active = true
     AND NOT EXISTS (
       SELECT 1 FROM recovery_assignment_history history
        WHERE history.user_id = v_user_id
          AND history.catalog_id = recovery_catalog.id
     )
     AND NOT EXISTS (
       SELECT 1 FROM recovery_tasks prior
        WHERE prior.user_id = v_user_id
          AND prior.catalog_id = recovery_catalog.id
     )
   ORDER BY random()
   LIMIT 1;

  IF v_catalog.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NO_UNUSED_RECOVERY_AVAILABLE';
  END IF;

  v_previous_catalog_id := v_recovery.catalog_id;
  v_previous_difficulty := v_recovery.difficulty;

  UPDATE recovery_tasks
     SET catalog_id = v_catalog.id,
         title = v_catalog.title,
         prompt = v_catalog.prompt,
         difficulty = v_catalog.difficulty,
         reroll_count = reroll_count + 1
   WHERE id = v_recovery.id
   RETURNING * INTO v_recovery;

  SELECT COALESCE(max(assignment_sequence), -1) + 1
    INTO v_assignment_sequence
    FROM recovery_assignment_history
   WHERE recovery_task_id = v_recovery.id;

  INSERT INTO recovery_assignment_history (
    user_id, recovery_task_id, catalog_id, previous_catalog_id,
    assignment_kind, assignment_sequence, reroll_number, assigned_title,
    assigned_prompt, assigned_difficulty, assigned_at
  ) VALUES (
    v_user_id, v_recovery.id, v_catalog.id, v_previous_catalog_id, 'reroll',
    v_assignment_sequence, v_recovery.reroll_count, v_catalog.title,
    v_catalog.prompt, v_catalog.difficulty, now()
  );

  RETURN jsonb_build_object(
    'recovery', to_jsonb(v_recovery),
    'rerollsRemaining', 2 - v_recovery.reroll_count,
    'previousDifficulty', v_previous_difficulty,
    'direction', CASE
      WHEN v_recovery.difficulty < v_previous_difficulty THEN 'easier'
      WHEN v_recovery.difficulty > v_previous_difficulty THEN 'harder'
      ELSE 'same'
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_notification_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'AUTH_REQUIRED';
  END IF;
  IF COALESCE(array_length(p_notification_ids, 1), 0) > 50 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TOO_MANY_NOTIFICATION_IDS';
  END IF;

  UPDATE notification_outbox
     SET read_at = COALESCE(read_at, now())
   WHERE user_id = v_user_id
     AND id = ANY(COALESCE(p_notification_ids, ARRAY[]::UUID[]));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_my_app_data(p_confirmation TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'AUTH_REQUIRED';
  END IF;
  IF p_confirmation <> 'DELETE MY DATA' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DELETION_CONFIRMATION_REQUIRED';
  END IF;

  DELETE FROM challenge_completions WHERE user_id = v_user_id;
  DELETE FROM proof_verification_attempts WHERE user_id = v_user_id;
  DELETE FROM recovery_tasks WHERE user_id = v_user_id;
  DELETE FROM notification_outbox WHERE user_id = v_user_id;
  DELETE FROM challenge_reports WHERE user_id = v_user_id;
  DELETE FROM daily_assignments WHERE user_id = v_user_id;
  DELETE FROM profiles WHERE user_id = v_user_id;

  INSERT INTO account_deletion_requests (user_id, requested_at, status)
  VALUES (v_user_id, now(), 'pending')
  ON CONFLICT (user_id) DO UPDATE SET
    requested_at = EXCLUDED.requested_at,
    processed_at = NULL,
    status = 'pending';

  RETURN jsonb_build_object(
    'deleted', true,
    'authAccountDeletionPending', true,
    'requestedAt', now()
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Project-admin-only RPCs used by trusted edge functions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_verified_completion(
  p_attempt_id UUID,
  p_score INTEGER,
  p_feedback TEXT,
  p_note TEXT,
  p_proof_name TEXT DEFAULT NULL,
  p_proof_sha256 TEXT DEFAULT NULL,
  p_proof_media_type TEXT DEFAULT NULL,
  p_proof_size_bytes INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_attempt proof_verification_attempts%ROWTYPE;
  v_assignment daily_assignments%ROWTYPE;
  v_completion challenge_completions%ROWTYPE;
  v_recovery recovery_tasks%ROWTYPE;
  v_verdict TEXT;
  v_target_points INTEGER := 0;
  v_points INTEGER := 0;
  v_previous_completed_date DATE;
  v_new_streak INTEGER;
BEGIN
  IF p_score NOT BETWEEN 0 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_PROOF_SCORE';
  END IF;
  IF char_length(btrim(COALESCE(p_note, ''))) > 4000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_PROOF_NOTE';
  END IF;
  IF p_proof_size_bytes IS NOT NULL AND p_proof_size_bytes NOT BETWEEN 0 AND 5242880 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_PROOF_SIZE';
  END IF;

  SELECT * INTO v_attempt
    FROM proof_verification_attempts
   WHERE id = p_attempt_id
   FOR UPDATE;

  IF v_attempt.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PROOF_ATTEMPT_NOT_FOUND';
  END IF;

  IF v_attempt.status = 'accepted' THEN
    SELECT * INTO v_completion
      FROM challenge_completions
     WHERE verification_attempt_id = v_attempt.id;
    SELECT * INTO v_assignment FROM daily_assignments WHERE id = v_attempt.assignment_id;
    SELECT * INTO v_recovery
      FROM recovery_tasks
     WHERE source_assignment_id = v_assignment.id;
    RETURN jsonb_build_object(
      'assessment', jsonb_build_object(
        'score', v_completion.score,
        'verdict', v_completion.verdict,
        'feedback', v_completion.ai_feedback
      ),
      'completion', to_jsonb(v_completion),
      'assignment', to_jsonb(v_assignment),
      'recovery', CASE WHEN v_recovery.id IS NULL THEN NULL ELSE to_jsonb(v_recovery) END,
      'idempotent', true
    );
  END IF;

  IF v_attempt.status <> 'reserved' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'PROOF_ATTEMPT_CLOSED';
  END IF;

  SELECT * INTO v_assignment
    FROM daily_assignments
   WHERE id = v_attempt.assignment_id
     AND user_id = v_attempt.user_id
   FOR UPDATE;

  IF v_assignment.id IS NULL OR v_assignment.status IN ('missed', 'replaced') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNMENT_CLOSED';
  END IF;
  IF v_attempt.requested_at > v_assignment.deadline_at
     OR now() > v_assignment.deadline_at + interval '5 minutes' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNMENT_DEADLINE_PASSED';
  END IF;

  v_verdict := CASE
    WHEN p_score >= 72 THEN 'complete'
    WHEN p_score >= 25 THEN 'partial'
    ELSE 'needs-more'
  END;
  v_target_points := CASE
    WHEN p_score >= 72 THEN 120
    WHEN p_score >= 25 THEN 60
    ELSE 0
  END;
  v_points := GREATEST(0, v_target_points - v_assignment.points_awarded);

  IF v_verdict = 'complete' AND v_assignment.status <> 'complete' THEN
    SELECT max(assignment_date) INTO v_previous_completed_date
      FROM daily_assignments
     WHERE user_id = v_attempt.user_id
       AND status = 'complete'
       AND assignment_date < v_assignment.assignment_date;

    SELECT streak INTO v_new_streak FROM profiles WHERE user_id = v_attempt.user_id FOR UPDATE;
    v_new_streak := CASE
      WHEN v_previous_completed_date = v_assignment.assignment_date - 1
        THEN COALESCE(v_new_streak, 0) + 1
      ELSE 1
    END;

  END IF;

  IF v_points > 0 OR (v_verdict = 'complete' AND v_assignment.status <> 'complete') THEN
    UPDATE profiles
       SET courage_points = courage_points + v_points,
           streak = CASE
             WHEN v_verdict = 'complete' AND v_assignment.status <> 'complete'
               THEN v_new_streak
             ELSE streak
           END,
           level = LEAST(5, 1 + ((courage_points + v_points) / 500))
     WHERE user_id = v_attempt.user_id;
  END IF;

  INSERT INTO challenge_completions (
    user_id, assignment_id, challenge_id, score, verdict, note, proof_name,
    ai_feedback, verification_attempt_id, points_awarded, proof_sha256,
    proof_media_type, proof_size_bytes, completed_at
  )
  VALUES (
    v_attempt.user_id, v_assignment.id, v_assignment.challenge_id, p_score,
    v_verdict, btrim(p_note), NULLIF(left(COALESCE(p_proof_name, ''), 255), ''),
    left(COALESCE(p_feedback, ''), 1000), v_attempt.id, v_points,
    NULLIF(left(COALESCE(p_proof_sha256, ''), 64), ''),
    NULLIF(left(COALESCE(p_proof_media_type, ''), 80), ''),
    p_proof_size_bytes, now()
  )
  RETURNING * INTO v_completion;

  UPDATE daily_assignments
     SET completion_score = GREATEST(COALESCE(completion_score, 0), p_score),
         status = CASE
           WHEN status = 'complete' THEN status
           WHEN v_verdict = 'complete' THEN 'complete'
           WHEN v_verdict = 'partial' THEN 'partial'
           ELSE status
         END,
         completed_at = CASE
           WHEN v_verdict = 'complete' THEN COALESCE(completed_at, now())
           ELSE completed_at
         END,
         points_awarded = points_awarded + v_points
   WHERE id = v_assignment.id
   RETURNING * INTO v_assignment;

  UPDATE proof_verification_attempts
     SET status = 'accepted',
         score = p_score,
         failure_code = NULL,
         completed_at = now()
   WHERE id = v_attempt.id;

  -- Partial proof should change the user's next action now, not at the nightly
  -- deadline. This stays inside the completion transaction: either the score,
  -- assignment, one recovery, its one audit row, and its one notification all
  -- commit together, or none of them do. The helper applies the same
  -- score-based starting difficulty as the missed-deadline path.
  IF v_verdict = 'partial' THEN
    UPDATE profiles SET streak = 0 WHERE user_id = v_attempt.user_id;
    v_recovery := public._create_recovery_for_assignment(
      v_attempt.user_id,
      v_assignment.id,
      now()
    );
  ELSE
    SELECT * INTO v_recovery
      FROM recovery_tasks
     WHERE source_assignment_id = v_assignment.id;
  END IF;

  RETURN jsonb_build_object(
    'assessment', jsonb_build_object(
      'score', p_score,
      'verdict', v_verdict,
      'feedback', left(COALESCE(p_feedback, ''), 1000)
    ),
    'completion', to_jsonb(v_completion),
    'assignment', to_jsonb(v_assignment),
    'recovery', CASE WHEN v_recovery.id IS NULL THEN NULL ELSE to_jsonb(v_recovery) END,
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_proof_verification(
  p_attempt_id UUID,
  p_failure_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE proof_verification_attempts
     SET status = 'failed',
         failure_code = left(COALESCE(NULLIF(p_failure_code, ''), 'PROVIDER_ERROR'), 80),
         completed_at = now()
   WHERE id = p_attempt_id
     AND status = 'reserved';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.run_daily_maintenance(p_batch_size INTEGER DEFAULT 500)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile RECORD;
  v_assignment daily_assignments%ROWTYPE;
  v_processed INTEGER := 0;
  v_errors INTEGER := 0;
  v_assignments_created INTEGER := 0;
  v_had_today BOOLEAN;
BEGIN
  IF p_batch_size NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_BATCH_SIZE';
  END IF;

  FOR v_profile IN
    SELECT user_id, timezone
      FROM profiles
     ORDER BY maintenance_checked_at NULLS FIRST, maintenance_checked_at, user_id
     LIMIT p_batch_size
  LOOP
    BEGIN
      v_had_today := EXISTS (
        SELECT 1 FROM daily_assignments
         WHERE user_id = v_profile.user_id
           AND assignment_date = (now() AT TIME ZONE v_profile.timezone)::date
           AND status <> 'replaced'
      );

      PERFORM public._process_user_state(v_profile.user_id, now());
      v_assignment := public._ensure_assignment_for(v_profile.user_id, now());

      IF NOT v_had_today AND v_assignment.id IS NOT NULL THEN
        v_assignments_created := v_assignments_created + 1;
      END IF;

      UPDATE profiles
         SET maintenance_checked_at = now()
       WHERE user_id = v_profile.user_id;
      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      UPDATE profiles
         SET maintenance_checked_at = now()
       WHERE user_id = v_profile.user_id;
    END;
  END LOOP;

  DELETE FROM proof_verification_attempts
   WHERE requested_at < now() - interval '30 days'
     AND status IN ('failed', 'reserved');
  DELETE FROM notification_outbox
   WHERE read_at < now() - interval '90 days';

  RETURN jsonb_build_object(
    'processedProfiles', v_processed,
    'assignmentsCreated', v_assignments_created,
    'errors', v_errors,
    'ranAt', now()
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE proof_verification_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_assignment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authenticated_read_catalog ON challenge_catalog;
CREATE POLICY authenticated_read_catalog ON challenge_catalog
  FOR SELECT TO authenticated USING (is_active = true);

DROP POLICY IF EXISTS authenticated_read_recovery_catalog ON recovery_catalog;
CREATE POLICY authenticated_read_recovery_catalog ON recovery_catalog
  FOR SELECT TO authenticated USING (is_active = true);

DROP POLICY IF EXISTS users_own_profile ON profiles;
DROP POLICY IF EXISTS users_read_own_profile ON profiles;
CREATE POLICY users_read_own_profile ON profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS users_own_assignments ON daily_assignments;
DROP POLICY IF EXISTS users_read_own_assignments ON daily_assignments;
CREATE POLICY users_read_own_assignments ON daily_assignments
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS users_read_own_proof_attempts ON proof_verification_attempts;
CREATE POLICY users_read_own_proof_attempts ON proof_verification_attempts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS users_own_completions ON challenge_completions;
DROP POLICY IF EXISTS users_read_own_completions ON challenge_completions;
CREATE POLICY users_read_own_completions ON challenge_completions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS users_own_recovery ON recovery_tasks;
DROP POLICY IF EXISTS users_read_own_recovery ON recovery_tasks;
CREATE POLICY users_read_own_recovery ON recovery_tasks
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS users_read_own_notifications ON notification_outbox;
CREATE POLICY users_read_own_notifications ON notification_outbox
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS users_read_own_deletion_request ON account_deletion_requests;
CREATE POLICY users_read_own_deletion_request ON account_deletion_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS users_read_own_challenge_reports ON challenge_reports;
CREATE POLICY users_read_own_challenge_reports ON challenge_reports
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS users_read_own_recovery_history ON recovery_assignment_history;
CREATE POLICY users_read_own_recovery_history ON recovery_assignment_history
  FOR SELECT TO authenticated USING (user_id = auth.uid());

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON challenge_catalog, recovery_catalog, profiles, daily_assignments,
  proof_verification_attempts, challenge_completions, recovery_tasks,
  recovery_assignment_history, notification_outbox, account_deletion_requests,
  challenge_reports TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON profiles, daily_assignments,
  proof_verification_attempts, challenge_completions, recovery_tasks,
  recovery_assignment_history, notification_outbox, account_deletion_requests,
  challenge_reports FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON challenge_catalog, recovery_catalog FROM authenticated;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._queue_notification(UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._create_recovery_for_assignment(UUID, UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._process_user_state(UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ensure_assignment_for(UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_daily_assignment() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_profile_preferences(TEXT, TEXT, BOOLEAN, SMALLINT, SMALLINT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, SMALLINT, JSONB, TEXT[], TEXT[], BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_proof_verification(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_challenge(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_recovery_task(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reroll_recovery_task(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_notifications_read(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_my_app_data(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_verified_completion(UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_proof_verification(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_daily_maintenance(INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ensure_daily_assignment() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_profile_preferences(TEXT, TEXT, BOOLEAN, SMALLINT, SMALLINT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, SMALLINT, JSONB, TEXT[], TEXT[], BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_proof_verification(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_challenge(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_recovery_task(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reroll_recovery_task(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_app_data(TEXT) TO authenticated;

-- InsForge's project-admin API key runs PostgREST as project_admin. These are
-- the only externally callable routines that may persist AI scores or run the
-- global maintenance loop.
GRANT EXECUTE ON FUNCTION public.record_verified_completion(UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) TO project_admin;
GRANT EXECUTE ON FUNCTION public.fail_proof_verification(UUID, TEXT) TO project_admin;
GRANT EXECUTE ON FUNCTION public.run_daily_maintenance(INTEGER) TO project_admin;

COMMIT;
