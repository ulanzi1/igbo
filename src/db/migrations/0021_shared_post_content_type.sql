-- Add 'shared_post' content type for chat messages that embed a feed post.
-- Content field stores JSON: { authorName, authorPhotoUrl, text, contentType, media[], postUrl }
-- Rendered as an inline card by MessageBubble (no FK to community_posts — the JSON is self-contained
-- so the embed survives if the original post is later deleted).

ALTER TYPE message_content_type ADD VALUE 'shared_post';
