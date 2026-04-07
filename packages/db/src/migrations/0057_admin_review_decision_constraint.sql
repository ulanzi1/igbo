-- Migration: 0057_admin_review_decision_constraint
-- Hardens portal_admin_reviews.decision with a CHECK constraint and adds a
-- decision index so the dashboard's decision-rate aggregates do not require
-- sequential scans as the table grows.

ALTER TABLE portal_admin_reviews
  ADD CONSTRAINT portal_admin_reviews_decision_check
  CHECK (decision IN ('approved', 'rejected', 'changes_requested'));

CREATE INDEX IF NOT EXISTS idx_portal_admin_reviews_decision
  ON portal_admin_reviews (decision);
