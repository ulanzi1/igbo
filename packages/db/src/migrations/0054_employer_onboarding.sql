-- Add onboarding tracking to portal company profiles
-- NULL = onboarding not completed; non-NULL = completed timestamp
ALTER TABLE portal_company_profiles
  ADD COLUMN onboarding_completed_at TIMESTAMPTZ;
