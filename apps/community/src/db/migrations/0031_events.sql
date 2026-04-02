CREATE TYPE community_event_type AS ENUM ('general', 'group');
CREATE TYPE community_event_format AS ENUM ('virtual', 'in_person', 'hybrid');
CREATE TYPE community_event_status AS ENUM ('upcoming', 'live', 'completed', 'cancelled');
CREATE TYPE community_event_attendee_status AS ENUM ('registered', 'waitlisted', 'attended', 'cancelled');
CREATE TYPE community_event_recurrence AS ENUM ('none', 'daily', 'weekly', 'monthly');

CREATE TABLE community_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  creator_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES community_groups(id) ON DELETE CASCADE,
  event_type community_event_type NOT NULL DEFAULT 'general',
  format community_event_format NOT NULL DEFAULT 'virtual',
  location TEXT,
  meeting_link TEXT,
  timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INT NOT NULL,
  registration_limit INT,
  attendee_count INT NOT NULL DEFAULT 0,
  recurrence_pattern community_event_recurrence NOT NULL DEFAULT 'none',
  recurrence_parent_id UUID REFERENCES community_events(id) ON DELETE CASCADE,
  status community_event_status NOT NULL DEFAULT 'upcoming',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX community_events_creator_id_idx ON community_events(creator_id);
CREATE INDEX community_events_group_id_idx ON community_events(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX community_events_status_start_idx ON community_events(status, start_time) WHERE deleted_at IS NULL;
CREATE INDEX community_events_recurrence_parent_idx ON community_events(recurrence_parent_id) WHERE recurrence_parent_id IS NOT NULL;

CREATE TABLE community_event_attendees (
  event_id UUID NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  status community_event_attendee_status NOT NULL DEFAULT 'registered',
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

-- Note: attendee_count is a denormalized counter. Story 7.2 (RSVP) must use
-- `attendee_count = attendee_count + 1` inside a transaction to avoid race conditions
-- (same pattern as member_count in community_groups).
CREATE INDEX community_event_attendees_user_id_idx ON community_event_attendees(user_id);
