-- P-6.5: "Viewed by Employer" Signal — Outbox Pattern
-- Adds viewed_at to portal_applications, dedup table, and transactional outbox table.

ALTER TABLE portal_applications ADD COLUMN viewed_at TIMESTAMPTZ;

CREATE TABLE portal_application_views (
  application_id UUID NOT NULL REFERENCES portal_applications(id) ON DELETE CASCADE,
  employer_user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (application_id, employer_user_id)
);

CREATE TABLE portal_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_portal_outbox_pending ON portal_outbox (status, created_at) WHERE status = 'pending';
