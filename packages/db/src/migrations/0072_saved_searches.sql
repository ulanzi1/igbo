-- Migration 0072: portal_saved_searches table for saved job search criteria and alert preferences

CREATE TYPE portal_alert_frequency AS ENUM ('instant', 'daily', 'off');

CREATE TABLE portal_saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  search_params_json JSONB NOT NULL,
  alert_frequency portal_alert_frequency NOT NULL DEFAULT 'daily',
  last_alerted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_searches_user_id ON portal_saved_searches(user_id);
CREATE INDEX idx_saved_searches_alert_frequency ON portal_saved_searches(alert_frequency) WHERE alert_frequency != 'off';
