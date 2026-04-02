-- Portal role enum extension
-- Adds JOB_SEEKER, EMPLOYER, JOB_ADMIN to the user_role enum for portal app support.
-- Existing MEMBER, ADMIN, MODERATOR values are unchanged.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'JOB_SEEKER';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'EMPLOYER';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'JOB_ADMIN';
