-- Story 7.3: Add joined_at column to community_event_attendees for video attendance tracking
ALTER TABLE community_event_attendees ADD COLUMN joined_at TIMESTAMPTZ;
