-- Migration 0033: Event recordings & reminders
-- Story 7.4: Event Reminders & Recordings

-- Recording status enum
CREATE TYPE recording_status_enum AS ENUM ('pending', 'ready', 'mirroring', 'lost');

-- Extend community_events with recording and room-mapping columns
ALTER TABLE community_events
  ADD COLUMN recording_url text,
  ADD COLUMN recording_mirror_url text,
  ADD COLUMN recording_status recording_status_enum NOT NULL DEFAULT 'pending',
  ADD COLUMN recording_expires_at timestamptz,
  ADD COLUMN recording_warning_sent_at timestamptz,
  ADD COLUMN recording_size_bytes bigint,
  ADD COLUMN recording_mirror_next_retry_at timestamptz,
  ADD COLUMN recording_mirror_retry_count int NOT NULL DEFAULT 0,
  ADD COLUMN daily_room_name text;

-- Index: for cleanup job (expired recordings with a mirror URL)
CREATE INDEX idx_events_recording_expires_at
  ON community_events (recording_expires_at)
  WHERE recording_mirror_url IS NOT NULL;

-- Index: for mirror retry polling job
CREATE INDEX idx_events_recording_mirror_retry
  ON community_events (recording_mirror_next_retry_at)
  WHERE recording_status = 'mirroring';

-- Index: for reverse-mapping Daily webhook room_name to event
CREATE INDEX idx_events_daily_room_name
  ON community_events (daily_room_name)
  WHERE daily_room_name IS NOT NULL;

-- Reminder tracking: JSONB column to track which reminders have been sent
-- Format: {"24h": true, "1h": true, "15m": true}
ALTER TABLE community_events
  ADD COLUMN reminder_sent_flags jsonb NOT NULL DEFAULT '{}';
