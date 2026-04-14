CREATE TYPE portal_verification_status AS ENUM (
  'pending',
  'approved',
  'rejected'
);

CREATE TABLE portal_employer_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES portal_company_profiles(id) ON DELETE CASCADE,
  submitted_documents jsonb NOT NULL DEFAULT '[]',
  status portal_verification_status NOT NULL DEFAULT 'pending',
  admin_notes text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by_admin_id uuid REFERENCES auth_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Deduplication: one pending request per company
CREATE UNIQUE INDEX portal_employer_verifications_company_pending_unique
  ON portal_employer_verifications (company_id)
  WHERE status = 'pending';

-- Admin queue: pending requests sorted by submission date
CREATE INDEX portal_employer_verifications_status_submitted_idx
  ON portal_employer_verifications (status, submitted_at ASC)
  WHERE status = 'pending';

-- History by company
CREATE INDEX portal_employer_verifications_company_id_idx
  ON portal_employer_verifications (company_id);
