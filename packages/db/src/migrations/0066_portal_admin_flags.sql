CREATE TYPE portal_admin_flag_status AS ENUM ('open', 'resolved', 'dismissed');

CREATE TYPE portal_violation_category AS ENUM (
  'misleading_content',
  'discriminatory_language',
  'scam_fraud',
  'terms_of_service_violation',
  'other'
);

CREATE TABLE portal_admin_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posting_id uuid NOT NULL REFERENCES portal_job_postings(id) ON DELETE CASCADE,
  admin_user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  category portal_violation_category NOT NULL,
  severity varchar(10) NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  description text NOT NULL,
  status portal_admin_flag_status NOT NULL DEFAULT 'open',
  auto_paused boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by_user_id uuid REFERENCES auth_users(id) ON DELETE SET NULL,
  resolution_action varchar(20) CHECK (
    resolution_action IS NULL
    OR resolution_action IN ('request_changes', 'reject', 'dismiss')
  ),
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index: open flags per posting (unique — one open flag per posting)
CREATE UNIQUE INDEX portal_admin_flags_posting_open_unique
  ON portal_admin_flags (posting_id)
  WHERE status = 'open';

-- Index: open flags sorted by severity for violations queue
CREATE INDEX portal_admin_flags_open_severity_idx
  ON portal_admin_flags (severity, created_at ASC)
  WHERE status = 'open';

-- Index: flags by posting for flag history lookups
CREATE INDEX portal_admin_flags_posting_id_idx
  ON portal_admin_flags (posting_id);
