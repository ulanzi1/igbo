CREATE TABLE portal_seeker_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  headline varchar(200) NOT NULL,
  summary text,
  skills text[] NOT NULL DEFAULT '{}',
  experience_json jsonb NOT NULL DEFAULT '[]',
  education_json jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX portal_seeker_profiles_user_id_unique
  ON portal_seeker_profiles (user_id);
