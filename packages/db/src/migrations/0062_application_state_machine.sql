-- Migration 0062: Application State Machine
-- Extends portal_applications with transition audit fields
-- Creates portal_actor_role_enum and portal_application_transitions table

--> statement-breakpoint

-- Enum for who performed the transition
CREATE TYPE portal_actor_role AS ENUM ('job_seeker', 'employer', 'job_admin');

--> statement-breakpoint

-- Extend portal_applications with audit fields
ALTER TABLE portal_applications
  ADD COLUMN previous_status portal_application_status,
  ADD COLUMN transitioned_at TIMESTAMPTZ,
  ADD COLUMN transitioned_by_user_id UUID REFERENCES auth_users(id) ON DELETE SET NULL,
  ADD COLUMN transition_reason TEXT;

--> statement-breakpoint

-- Full chronological audit trail of all application status changes
CREATE TABLE portal_application_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES portal_applications(id) ON DELETE CASCADE,
  from_status portal_application_status NOT NULL,
  to_status portal_application_status NOT NULL,
  actor_user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE RESTRICT,
  actor_role portal_actor_role NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

--> statement-breakpoint

-- Index for efficient history queries by application
CREATE INDEX idx_portal_application_transitions_application_id
  ON portal_application_transitions(application_id);
