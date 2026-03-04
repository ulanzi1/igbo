-- Migration: 0023_community_groups.sql
-- Creates community_groups and community_group_members tables.
-- Adds FK constraint on community_posts.group_id → community_groups.id (deferred from Story 4.1).
--
-- Enums:
--   community_group_visibility       : public | private | hidden
--   community_group_join_type        : open | approval
--   community_group_posting_permission   : all_members | leaders_only | moderated
--   community_group_commenting_permission: open | members_only | disabled
--   community_group_member_role      : member | leader | creator
--   community_group_member_status    : active | pending | banned
--
-- FK on community_posts.group_id uses ON DELETE SET NULL so group deletion
-- does not cascade-delete posts.

CREATE TYPE community_group_visibility AS ENUM ('public', 'private', 'hidden');
CREATE TYPE community_group_join_type AS ENUM ('open', 'approval');
CREATE TYPE community_group_posting_permission AS ENUM ('all_members', 'leaders_only', 'moderated');
CREATE TYPE community_group_commenting_permission AS ENUM ('open', 'members_only', 'disabled');
CREATE TYPE community_group_member_role AS ENUM ('member', 'leader', 'creator');
CREATE TYPE community_group_member_status AS ENUM ('active', 'pending', 'banned');

CREATE TABLE community_groups (
    id                    UUID                                 NOT NULL DEFAULT gen_random_uuid(),
    name                  VARCHAR(100)                         NOT NULL,
    description           TEXT,
    banner_url            TEXT,
    visibility            community_group_visibility           NOT NULL DEFAULT 'public',
    join_type             community_group_join_type            NOT NULL DEFAULT 'open',
    posting_permission    community_group_posting_permission   NOT NULL DEFAULT 'all_members',
    commenting_permission community_group_commenting_permission NOT NULL DEFAULT 'open',
    member_limit          INTEGER                              CHECK (member_limit > 0),
    creator_id            UUID                                 NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    member_count          INTEGER                              NOT NULL DEFAULT 0,
    deleted_at            TIMESTAMPTZ,
    created_at            TIMESTAMPTZ                          NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ                          NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_community_groups PRIMARY KEY (id)
);

CREATE INDEX idx_community_groups_creator_id ON community_groups(creator_id);
CREATE INDEX idx_community_groups_visibility ON community_groups(visibility) WHERE deleted_at IS NULL;

CREATE TABLE community_group_members (
    group_id  UUID                       NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
    user_id   UUID                       NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    role      community_group_member_role   NOT NULL DEFAULT 'member',
    status    community_group_member_status NOT NULL DEFAULT 'active',
    joined_at TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
    CONSTRAINT pk_community_group_members PRIMARY KEY (group_id, user_id)
);

CREATE INDEX idx_community_group_members_user_id  ON community_group_members(user_id);
CREATE INDEX idx_community_group_members_group_id ON community_group_members(group_id);

-- Add the FK constraint that was deferred from Story 4.1 migration 0018.
-- community_posts.group_id already exists as a bare UUID column; this adds the referential constraint.
-- ON DELETE SET NULL: deleting a group sets post.group_id to NULL, preserving the posts.
ALTER TABLE community_posts
    ADD CONSTRAINT community_posts_group_id_fkey
    FOREIGN KEY (group_id) REFERENCES community_groups(id) ON DELETE SET NULL;
