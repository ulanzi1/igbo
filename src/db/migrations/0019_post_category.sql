-- community_post_category: member-facing label for post classification.
-- Separate from content_type (which describes technical content format).
-- 'announcement' here is a member-selected label (e.g., "I'm announcing an event
-- in my area") — distinct from content_type='announcement' which is admin-only.
-- 'discussion' is the default for standard member posts.
-- 'event' allows members to tag posts as event-related.

CREATE TYPE community_post_category AS ENUM ('discussion', 'event', 'announcement');

ALTER TABLE community_posts
  ADD COLUMN category community_post_category NOT NULL DEFAULT 'discussion';
