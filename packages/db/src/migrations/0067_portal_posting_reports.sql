CREATE TYPE portal_report_category AS ENUM (
  'scam_fraud',
  'misleading_info',
  'discriminatory_content',
  'duplicate_posting',
  'other'
);

CREATE TYPE portal_report_status AS ENUM (
  'open',
  'investigating',
  'resolved',
  'dismissed'
);

CREATE TYPE portal_report_priority AS ENUM (
  'normal',
  'elevated',
  'urgent'
);

CREATE TABLE portal_posting_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posting_id uuid NOT NULL REFERENCES portal_job_postings(id) ON DELETE CASCADE,
  reporter_user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  category portal_report_category NOT NULL,
  description text NOT NULL,
  status portal_report_status NOT NULL DEFAULT 'open',
  resolution_action varchar(30),
  resolved_at timestamptz,
  resolved_by_user_id uuid REFERENCES auth_users(id) ON DELETE SET NULL,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Deduplication: one active report per user per posting
CREATE UNIQUE INDEX portal_posting_reports_user_posting_active_unique
  ON portal_posting_reports (posting_id, reporter_user_id)
  WHERE status IN ('open', 'investigating');

-- Report queue: open/investigating reports grouped by posting, sorted for admin
CREATE INDEX portal_posting_reports_status_created_idx
  ON portal_posting_reports (status, created_at ASC)
  WHERE status IN ('open', 'investigating');

-- Count reports per posting for priority computation
CREATE INDEX portal_posting_reports_posting_id_idx
  ON portal_posting_reports (posting_id);
