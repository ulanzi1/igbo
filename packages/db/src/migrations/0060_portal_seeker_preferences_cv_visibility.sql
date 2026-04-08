CREATE TABLE portal_seeker_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seeker_profile_id uuid NOT NULL UNIQUE REFERENCES portal_seeker_profiles(id) ON DELETE CASCADE,
  desired_roles text[] NOT NULL DEFAULT '{}',
  salary_min integer,
  salary_max integer,
  salary_currency varchar(3) NOT NULL DEFAULT 'NGN',
  locations text[] NOT NULL DEFAULT '{}',
  work_modes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE portal_seeker_cvs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seeker_profile_id uuid NOT NULL REFERENCES portal_seeker_profiles(id) ON DELETE CASCADE,
  file_upload_id uuid NOT NULL UNIQUE REFERENCES platform_file_uploads(id) ON DELETE RESTRICT,
  label varchar(100) NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX portal_seeker_cvs_seeker_profile_id_idx ON portal_seeker_cvs (seeker_profile_id);
CREATE UNIQUE INDEX portal_seeker_cvs_one_default_per_seeker
  ON portal_seeker_cvs (seeker_profile_id) WHERE is_default = TRUE;

ALTER TABLE portal_seeker_profiles
  ADD COLUMN visibility varchar(16) NOT NULL DEFAULT 'passive'
    CHECK (visibility IN ('active','passive','hidden')),
  ADD COLUMN consent_matching boolean NOT NULL DEFAULT false,
  ADD COLUMN consent_employer_view boolean NOT NULL DEFAULT false,
  ADD COLUMN consent_matching_changed_at timestamptz,
  ADD COLUMN consent_employer_view_changed_at timestamptz;
