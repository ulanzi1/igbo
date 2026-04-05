-- Portal schema foundation: company profiles, job postings, and applications stub.
-- Introduces 3 enums and 3 tables with foreign keys and performance indexes.
-- All tables use the portal_ namespace prefix per AC #4.

-- Enums
CREATE TYPE portal_employment_type AS ENUM (
  'full_time',
  'part_time',
  'contract',
  'internship',
  'apprenticeship'
);

CREATE TYPE portal_job_status AS ENUM (
  'draft',
  'pending_review',
  'active',
  'paused',
  'filled',
  'expired',
  'rejected'
);

CREATE TYPE portal_application_status AS ENUM (
  'submitted',
  'under_review',
  'shortlisted',
  'interview',
  'offered',
  'hired',
  'rejected',
  'withdrawn'
);

-- portal_company_profiles: one profile per employer user
CREATE TABLE IF NOT EXISTS portal_company_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  logo_url        TEXT,
  description     TEXT,
  industry        VARCHAR(100),
  company_size    VARCHAR(50),
  culture_info    TEXT,
  trust_badge     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- portal_job_postings: listings attached to a company profile
CREATE TABLE IF NOT EXISTS portal_job_postings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id               UUID NOT NULL REFERENCES portal_company_profiles(id) ON DELETE CASCADE,
  title                    VARCHAR(200) NOT NULL,
  description_html         TEXT,
  requirements             TEXT,
  salary_min               INTEGER,
  salary_max               INTEGER,
  salary_competitive_only  BOOLEAN NOT NULL DEFAULT FALSE,
  location                 VARCHAR(200),
  employment_type          portal_employment_type NOT NULL,
  status                   portal_job_status NOT NULL DEFAULT 'draft',
  cultural_context_json    JSONB,
  description_igbo_html    TEXT,
  application_deadline     TIMESTAMPTZ,
  expires_at               TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- portal_applications: stub table (fields extended in Epic 2)
CREATE TABLE IF NOT EXISTS portal_applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES portal_job_postings(id) ON DELETE CASCADE,
  seeker_user_id  UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  status          portal_application_status NOT NULL DEFAULT 'submitted',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portal_company_profiles_owner_user_id
  ON portal_company_profiles (owner_user_id);

CREATE INDEX IF NOT EXISTS idx_portal_job_postings_company_id
  ON portal_job_postings (company_id);

CREATE INDEX IF NOT EXISTS idx_portal_job_postings_status_created_at
  ON portal_job_postings (status, created_at);

CREATE INDEX IF NOT EXISTS idx_portal_job_postings_company_id_status
  ON portal_job_postings (company_id, status);

CREATE INDEX IF NOT EXISTS idx_portal_applications_job_id
  ON portal_applications (job_id);

CREATE INDEX IF NOT EXISTS idx_portal_applications_seeker_user_id
  ON portal_applications (seeker_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_applications_job_seeker_unique
  ON portal_applications (job_id, seeker_user_id);
