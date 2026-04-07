-- Migration 0058: Portal screening columns + screening keywords table + system user seed

CREATE TYPE portal_screening_status AS ENUM ('pass', 'warning', 'fail');

ALTER TABLE portal_job_postings
  ADD COLUMN screening_status portal_screening_status,
  ADD COLUMN screening_result_json jsonb,
  ADD COLUMN screening_checked_at timestamptz;

CREATE INDEX portal_job_postings_screening_status_idx
  ON portal_job_postings (screening_status)
  WHERE screening_status IS NOT NULL;

CREATE TABLE portal_screening_keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phrase varchar(200) NOT NULL,
  category varchar(40) NOT NULL CHECK (category IN ('discriminatory','illegal','scam','other')),
  severity varchar(10) NOT NULL DEFAULT 'high' CHECK (severity IN ('low','medium','high')),
  notes text,
  created_by_admin_id uuid REFERENCES auth_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX portal_screening_keywords_phrase_unique
  ON portal_screening_keywords (lower(phrase))
  WHERE deleted_at IS NULL;

CREATE INDEX portal_screening_keywords_active_idx
  ON portal_screening_keywords (created_at DESC)
  WHERE deleted_at IS NULL;

-- Seed: system user for automated actions (fast-lane auto-approvals, etc.)
INSERT INTO auth_users (
  id, email, email_verified, name,
  account_status, role, language_preference,
  created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'system@igbo.local',
  NOW(),
  'System',
  'ACTIVE',
  'MEMBER',
  'en',
  NOW(),
  NOW()
) ON CONFLICT (id) DO NOTHING;
