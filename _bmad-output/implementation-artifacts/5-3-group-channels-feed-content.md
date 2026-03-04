# Story 5.3: Group Channels, Feed & Content

Status: done

## Story

As a group member,
I want to participate in group chat channels, view the group news feed, access shared files, and see the member list,
so that I can engage with group activity across multiple formats.

## Acceptance Criteria

1. **Given** a member opens a group
   **When** the group page loads
   **Then** the group displays: header with banner and description, tabs for Feed, Channels, Members, and Files (FR46)
   **And** the group feed shows posts from group members ordered by recency (pinned first, then newest)
   **And** the group chat channels are accessible in a Slack-style sidebar within the group

2. **Given** a group has chat channels
   **When** a member views the Channels tab
   **Then** a default "General" channel exists for all groups (FR46)
   **And** group leaders/creators can create additional channels (e.g., "Announcements", "Events", "Off-topic") up to a max of 10
   **And** chat in group channels uses the existing real-time infrastructure from Epic 2 (ChatWindow + conversationId)

3. **Given** a group has shared files
   **When** a member views the Files tab
   **Then** all files shared in group channels (via chat message attachments) are aggregated (FR46)
   **And** files display with name, type, size, uploader, and upload date
   **And** members can download files (direct link to processedUrl)

4. **Given** a group leader wants to pin an announcement
   **When** they create or select a post in the group feed and mark it as pinned
   **Then** the post appears at the top of the group feed with a "Pinned" label (FR47)
   **And** only group leaders and the creator can pin/unpin posts within the group

5. **Given** a member is added to a group by a leader (or any non-self-service path)
   **When** the addition is processed
   **Then** the system enforces the 40-group membership limit (FR48) on the target member regardless of who initiates the addition
   **And** if the target member is at 40 groups, the action is blocked with: "[Name] has reached the maximum of 40 groups and cannot be added."

6. **Given** a member joins or leaves a group (Story 5.2 deferred items now complete)
   **When** the join/leave is processed
   **Then** a system message "[DisplayName] joined the group" or "[DisplayName] left the group" appears in the General channel
   **And** the member's Socket.IO connection joins all group channel conversation rooms on group membership

7. **Given** the database needs channel support
   **When** this story is implemented
   **Then** migration 0024 creates the `community_group_channels` table
   **And** adds a `channel_id` nullable FK column to `chat_conversations` referencing `community_group_channels.id` (ON DELETE SET NULL)
   **And** `createGroupForUser()` is extended to create a default "General" channel + backing conversation atomically

## Tasks / Subtasks

- [x] Task 1: DB schema & migration 0024 (AC: #7)
  - [x]Create `src/db/schema/community-group-channels.ts`:
    - [x]Table `communityGroupChannels` with: id (UUID PK default random), groupId (UUID FK CASCADE → community_groups.id NOT NULL), name (VARCHAR 100 NOT NULL), description (TEXT nullable), isDefault (BOOLEAN NOT NULL default false), createdBy (UUID FK CASCADE → auth_users.id NOT NULL), createdAt (TIMESTAMPTZ NOT NULL default NOW())
    - [x]Index: `idx_community_group_channels_group_id` on groupId
    - [x]Export types: `CommunityGroupChannel`, `NewCommunityGroupChannel`
    - [x]Export: `communityGroupChannels` table object
  - [x]Modify `src/db/schema/chat-conversations.ts`:
    - [x]Add column: `channelId: uuid("channel_id").references(() => communityGroupChannels.id, { onDelete: "setNull" })` — nullable, no `notNull()`
    - [x]Import `communityGroupChannels` from `"./community-group-channels"`
    - [x]Extend `chatConversationsRelations` with `channel: one(communityGroupChannels, { fields: [chatConversations.channelId], references: [communityGroupChannels.id] })`
  - [x]Modify `src/db/index.ts`: add `import * as communityGroupChannelsSchema from "./schema/community-group-channels"`; add to drizzle() schema object
  - [x]Hand-write migration `src/db/migrations/0024_group_channels.sql`:
    ```sql
    CREATE TABLE community_group_channels (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      group_id UUID NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_by UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX idx_community_group_channels_group_id ON community_group_channels(group_id);
    ALTER TABLE chat_conversations ADD COLUMN channel_id UUID REFERENCES community_group_channels(id) ON DELETE SET NULL;
    CREATE INDEX idx_chat_conversations_channel_id ON chat_conversations(channel_id) WHERE channel_id IS NOT NULL;
    ```

- [x] Task 2: Group channel data access layer (AC: #2, #3, #6, #7)
  - [x]Create `src/db/queries/group-channels.ts` (no `server-only` — consistent with other query files):
    - [x]`createGroupChannel(input: { groupId, name, description?, isDefault, createdBy }, tx?)`: INSERT into `communityGroupChannels`; returns `CommunityGroupChannel`
    - [x]`createChannelConversation(channelId, tx?)`: INSERT into `chatConversations` with `type: "channel"`, `channelId`; returns `ChatConversation`
    - [x]`addMembersToConversation(conversationId, userIds, tx?)`: bulk-INSERT into `chatConversationMembers` for all userIds with `role: "member"`; use `ON CONFLICT DO NOTHING` (idempotent)
    - [x]`listGroupChannels(groupId)`: SELECT `communityGroupChannels.*`, `chat_conversations.id AS conversationId` FROM `communityGroupChannels` JOIN `chatConversations` ON `chatConversations.channelId = communityGroupChannels.id` WHERE `groupId = $1` AND `chatConversations.deletedAt IS NULL` ORDER BY `isDefault DESC`, `createdAt ASC`; returns `GroupChannelItem[]`
    - [x]`getGroupChannel(channelId)`: fetch single channel; returns `CommunityGroupChannel | null`
    - [x]`deleteGroupChannel(channelId)`: hard-DELETE `communityGroupChannels` row (FK cascade nulls `chat_conversations.channelId` via ON DELETE SET NULL)
    - [x]`softDeleteChannelConversation(conversationId, tx?)`: UPDATE `chatConversations SET deleted_at = NOW() WHERE id = $1`
    - [x]`getDefaultChannelConversationId(groupId)`: SELECT `cc.id` FROM `chatConversations cc` JOIN `communityGroupChannels cgc` ON `cc.channelId = cgc.id` WHERE `cgc.groupId = $1 AND cgc.isDefault = TRUE AND cc.deletedAt IS NULL` LIMIT 1; returns `string | null`
    - [x]`countGroupChannels(groupId)`: SELECT COUNT(\*) FROM `communityGroupChannels` WHERE `groupId = $1`
    - [x]`listActiveGroupMemberIds(groupId)`: SELECT `userId` FROM `communityGroupMembers` WHERE `groupId = $1 AND status = 'active'`
    - [x]Type `GroupChannelItem`: `{ id, groupId, name, description, isDefault, createdBy, createdAt, conversationId }`
  - [x]Extend `src/db/queries/groups.ts` with:
    - [x]`listActiveGroupMembers(groupId, cursor?, limit?)`: SELECT `cgm.*`, `cp.displayName`, `cp.photoUrl` FROM `communityGroupMembers cgm` JOIN `communityProfiles cp` ON `cgm.userId = cp.userId` WHERE `cgm.groupId = $1 AND cgm.status = 'active'` ORDER BY `cgm.joinedAt ASC` — cursor pagination by `joinedAt` ISO string; returns `GroupMemberItem[]`
    - [x]Type `GroupMemberItem`: `{ userId, displayName, photoUrl | null, role, joinedAt }`

- [x] Task 3: Group channel service (AC: #2, #3, #4, #7)
  - [x]Create `src/services/group-channel-service.ts` (`import "server-only"`):
    - [x]`createDefaultChannel(groupId, creatorId, tx?)`:
      - [x]Call `createGroupChannel({ groupId, name: "General", isDefault: true, createdBy: creatorId }, tx)`
      - [x]Call `createChannelConversation(channel.id, tx)`
      - [x]Fetch all active group member IDs via `listActiveGroupMemberIds(groupId)`
      - [x]Call `addMembersToConversation(conversation.id, memberIds, tx)` (may be empty if called during group creation)
      - [x]Returns `{ channel: CommunityGroupChannel, conversationId: string }`
    - [x]`createChannel(leaderId, groupId, input: { name: string, description?: string })`:
      - [x]Verify caller is creator or leader via `getGroupMember(groupId, leaderId)` → role IN ["creator", "leader"]; throw 403 `ApiError` if not
      - [x]Check channel count: `countGroupChannels(groupId) >= 10` → throw 422 `ApiError`: "Groups.channel.maxChannelsReached"
      - [x]Validate name: non-empty, max 100 chars (Zod from "zod/v4")
      - [x]`createGroupChannel({ groupId, name, description, isDefault: false, createdBy: leaderId })`
      - [x]`createChannelConversation(channel.id)`
      - [x]Fetch active member IDs + `addMembersToConversation(conversationId, memberIds)`
      - [x]Emit EventBus: `"group.channel_created"` `{ groupId, channelId: channel.id, createdBy: leaderId, timestamp }`
      - [x]Returns `GroupChannelItem`
    - [x]`deleteChannel(leaderId, groupId, channelId)`:
      - [x]Verify caller is creator or leader
      - [x]Fetch channel; throw 404 if not found
      - [x]Throw 403 `ApiError` if `channel.isDefault === true` ("Cannot delete the General channel")
      - [x]Fetch channel's conversationId via `listGroupChannels(groupId)` or lookup
      - [x]`softDeleteChannelConversation(conversationId)` (marks `deleted_at` — prevents new messages, preserves history)
      - [x]`deleteGroupChannel(channelId)` (hard-delete; FK SET NULL nulls `chatConversations.channelId`)
      - [x]Emit EventBus: `"group.channel_deleted"` `{ groupId, channelId, deletedBy: leaderId, timestamp }`
    - [x]`listChannelsForGroup(groupId)`: returns `GroupChannelItem[]` via `listGroupChannels(groupId)`

- [x] Task 4: Extend createGroupForUser (AC: #7)
  - [x]Modify `src/services/group-service.ts` `createGroupForUser()`:
    - [x]After `dbCreateGroup(input, tx)` succeeds (inside or immediately after the transaction), call `createDefaultChannel(group.id, userId)`
    - [x]The group creation DB function (`createGroup` in `src/db/queries/groups.ts`) uses a transaction internally — call `createDefaultChannel` after the group TX completes, as a separate step (not nested in the same tx, unless `createGroup` exposes a `tx` param — check and use if available)
    - [x]Emit a single `"group.created"` event as before (no change to existing event)

- [x] Task 5: System messages for join/leave (deferred from Story 5.2) (AC: #6)
  - [x]Modify `src/services/group-membership-service.ts`:
    - [x]Add import: `import { getDefaultChannelConversationId } from "@/db/queries/group-channels"`
    - [x]Add import: `import { db } from "@/db"` + `communityProfiles` from schema for displayName lookup
    - [x]Helper (module-private): `async function getDisplayName(userId: string): Promise<string>` — query `communityProfiles WHERE userId = $1`, return `displayName ?? "A member"`
    - [x]In `joinOpenGroup()`: after successful `insertGroupMember` and `eventBus.emit("group.member_joined")`, call:
      ```typescript
      const conversationId = await getDefaultChannelConversationId(groupId);
      if (conversationId) {
        const name = await getDisplayName(userId);
        await messageService.sendSystemMessage(conversationId, userId, `${name} joined the group`);
      }
      ```
    - [x]In `leaveGroup()`: same pattern with "left the group" message (called after `removeGroupMember`)
    - [x]Add import: `import { messageService } from "@/services/message-service"`
    - [x]Note: `messageService` is already exported from `src/services/message-service.ts` as `PlaintextMessageService` instance
  - [x]Also wire system message in `approveJoinRequest()` (member joins on approval — same pattern)

- [x] Task 6: Socket.IO room join for group channels (AC: #6)
  - [x]Modify `src/server/realtime/` EventBus bridge (the file that handles `socketsJoin`/`socketsLeave` — established in Story 2.3):
    - [x]On EventBus `"group.member_joined"` (payload `{ groupId, userId }`):
      - [x]Fetch all channel conversationIds for the group via `listGroupChannels(groupId)`
      - [x]For each conversationId, emit `socketsJoin` with `{ userId, room: "conversation:{conversationId}" }`
    - [x]On EventBus `"group.member_left"` (payload `{ groupId, userId }`):
      - [x]Fetch all channel conversationIds
      - [x]Emit `socketsLeave` for each: `{ userId, room: "conversation:{conversationId}" }`

- [x] Task 7: Group feed data layer (AC: #1, #4)
  - [x]Extend `src/db/queries/feed.ts`:
    - [x]Add `getGroupFeedPosts(groupId: string, params: { cursor?: string; limit?: number; viewerId?: string })`:
      - [x]Reuse `FEED_SELECT_COLUMNS` + `_assemblePostPage()` (no duplication)
      - [x]WHERE clause: `communityPosts.groupId = groupId AND communityPosts.deletedAt IS NULL`
      - [x]Pinned posts at top: same `CASE WHEN isPinned THEN pinnedAt ELSE NULL END DESC NULLS LAST` + `createdAt DESC` as main chronological feed
      - [x]Cursor pagination: same pattern as `getFeedPosts` (base64 of ISO createdAt)
      - [x]LEFT JOIN `communityPostBookmarks` on `(postId, viewerId)` for `isBookmarked` (if viewerId provided)
      - [x]No visibility filter (group content is visible to all active group members — enforced at route layer)
      - [x]Returns same `{ posts: FeedPost[], nextCursor: string | null }`
  - [x]Add `createGroupPost(authorId, groupId, input)` as a NEW exported function in `src/services/post-service.ts`:
    - [x]**Note: `post-service.ts` currently has NO `groupId` references.** `createFeedPost()` takes `{ authorId, content, contentType, category, fileUploadIds?, mediaTypes? }` — it does NOT accept `groupId`.
    - [x]`createGroupPost` should: verify `groupId` is a valid non-deleted group (via `getGroupById`), verify caller is active member (via `getGroupMember`), enforce `postingPermission` (if `leaders_only` → verify role is "creator" or "leader"; throw 403 if not), then call `insertPost()` with `groupId` set on the post row
    - [x]The `createPost` server action (Task 11) will call `createGroupPost` when `groupId` is present, or `createFeedPost` when absent

- [x] Task 8: Group pin route (AC: #4)
  - [x]Create `src/app/api/v1/groups/[groupId]/posts/[postId]/pin/route.ts`:
    - [x]`PATCH` handler: `withApiHandler()` + `requireAuthenticatedSession()`
    - [x]Extract `groupId` and `postId` from `pathname.split("/")` — see Route Param Extraction table in Dev Notes (groupId = `.at(-4)`, postId = `.at(-2)`)
    - [x]Verify caller is active member with role "creator" or "leader" via `getGroupMember(groupId, userId)`; throw 403 if not
    - [x]Verify post belongs to this group (`communityPosts.groupId = groupId`); throw 404 if not
    - [x]Toggle: if `isPinned === false` → SET `isPinned = true`, `pinnedAt = NOW()`; else SET `isPinned = false`, `pinnedAt = NULL`
    - [x]Use existing `updatePost()` or a new `togglePostPin(postId, isPinned)` query in `src/db/queries/posts.ts`
    - [x]Return `{ pinned: boolean }`
    - [x]Rate limit: `GROUP_MANAGE: { maxRequests: 20, windowMs: 60_000 }` (add to rate-limiter presets)

- [x] Task 9: Group API routes (AC: #2, #3, #5)
  - [x]`GET /api/v1/groups/[groupId]/posts` (`src/app/api/v1/groups/[groupId]/posts/route.ts`):
    - [x]`withApiHandler()` + `requireAuthenticatedSession()`
    - [x]Verify caller is active group member OR group is not-hidden (public/private listing allowed without membership? No — group feed is member-only)
    - [x]Actually: require active membership for group feed (throw 403 if not member)
    - [x]Accept query params: `cursor`, `limit` (max 20)
    - [x]Call `getGroupFeedPosts(groupId, { cursor, limit, viewerId: userId })`
    - [x]Return `{ posts: FeedPost[], nextCursor: string | null }`
  - [x]`POST /api/v1/groups/[groupId]/posts`:
    - [x]Same auth + membership verification
    - [x]Body: same shape as `POST /api/v1/posts` but no `groupId` in body (taken from URL)
    - [x]Call `createGroupPost(userId, groupId, input)`
    - [x]Return `{ post: FeedPost }`
    - [x]Rate limit: reuse `POST_CREATE` preset
  - [x]`GET /api/v1/groups/[groupId]/channels` (`src/app/api/v1/groups/[groupId]/channels/route.ts`):
    - [x]`withApiHandler()` + `requireAuthenticatedSession()` + active membership check
    - [x]Call `listChannelsForGroup(groupId)`
    - [x]Return `{ channels: GroupChannelItem[] }`
  - [x]`POST /api/v1/groups/[groupId]/channels`:
    - [x]Leader/creator only
    - [x]Body: `{ name: string, description?: string }` (Zod validate from "zod/v4")
    - [x]Call `createChannel(userId, groupId, input)` from group-channel-service
    - [x]Return 201 `{ channel: GroupChannelItem }`
    - [x]Rate limit: `GROUP_CHANNEL: { maxRequests: 5, windowMs: 60_000 }` (add to rate-limiter presets)
  - [x]`DELETE /api/v1/groups/[groupId]/channels/[channelId]` (`src/app/api/v1/groups/[groupId]/channels/[channelId]/route.ts`):
    - [x]Leader/creator only; call `deleteChannel(userId, groupId, channelId)`
    - [x]Return 204
  - [x]`GET /api/v1/groups/[groupId]/members` (`src/app/api/v1/groups/[groupId]/members/route.ts`):
    - [x]Auth required; accessible to group members OR public/private group pages (anyone can see member list of public/private group)
    - [x]Accept `cursor`, `limit` (max 50)
    - [x]Call `listActiveGroupMembers(groupId, cursor, limit)`
    - [x]Return `{ members: GroupMemberItem[], nextCursor: string | null }`
  - [x]`GET /api/v1/groups/[groupId]/files` (`src/app/api/v1/groups/[groupId]/files/route.ts`):
    - [x]Active membership required
    - [x]Query: SELECT `cma.*`, `auth_users.name AS uploaderName` FROM `chatMessageAttachments cma` JOIN `chatMessages cm` ON `cma.messageId = cm.id` JOIN `chatConversations cc` ON `cm.conversationId = cc.id` JOIN `communityGroupChannels cgc` ON `cc.channelId = cgc.id` WHERE `cgc.groupId = $1` ORDER BY `cma.createdAt DESC` LIMIT 50 OFFSET cursor
    - [x]Return `{ files: GroupFileItem[], nextCursor: string | null }`
    - [x]Type `GroupFileItem`: `{ id, fileName, fileUrl, fileType, fileSize, uploadedAt, uploaderName, messageId, conversationId }`
    - [x]Put this query in `src/db/queries/group-channels.ts` as `listGroupFiles(groupId, cursor?, limit?)`

- [x] Task 10: Group detail page UI (AC: #1, #2, #3, #4)
  - [x]Replace `src/app/[locale]/(app)/groups/[groupId]/GroupDetailStub.tsx` with real `GroupDetail` component:
    - [x]File: `src/features/groups/components/GroupDetail.tsx` ("use client")
    - [x]Props: `group: GroupDetail` (from `getGroupDetails(groupId)`), `viewerMembership: { role, status } | null`, `viewerId: string`
    - [x]Use shadcn/ui `<Tabs>` component (already in project via `@/components/ui/tabs`) with tabs: Feed, Channels, Members, Files
    - [x]Default tab: "feed"
    - [x]State: `activeChannelId: string | null` (null = no channel selected in Channels tab)
  - [x]Feed tab (`GroupFeedTab`):
    - [x]`PostComposer` component with `groupId` prop (see Task 11 for PostComposer changes)
    - [x]`FeedList` component filtered to group: fetch via `GET /api/v1/groups/[groupId]/posts`; reuse existing `useFeed` hook or create `useGroupFeed(groupId)` with TanStack `useInfiniteQuery`
    - [x]Leader/creator: show pin button on `FeedItem` (call `PATCH /api/v1/groups/[groupId]/posts/[postId]/pin`)
    - [x]`FeedItem` already has `isPinned` + `pinnedAt` from `FeedPost` type — add "Pinned" label rendering when `isPinned === true` (check if already rendered; if not, add)
  - [x]Channels tab (`GroupChannelsTab`):
    - [x]Left sidebar: list of `GroupChannelItem[]` fetched from `GET /api/v1/groups/[groupId]/channels`
    - [x]"General" first (isDefault), then others alphabetically
    - [x]Click channel → set `activeChannelId`; channel conversation room joined via Socket.IO on mount (emit chat join for each conversationId via existing chat namespace pattern)
    - [x]Leader/creator: "Add Channel" button → dialog with name + optional description
    - [x]Leader/creator: "Delete" button on non-default channels (with confirmation)
    - [x]Right panel: `ChatWindow` component (from `@/features/chat`) with `conversationId = activeChannel.conversationId` — **reuse existing ChatWindow as-is**; it handles all message sending, reactions, threading, search
    - [x]If no channel selected → prompt "Select a channel to start chatting"
  - [x]Members tab (`GroupMembersTab`):
    - [x]Fetch from `GET /api/v1/groups/[groupId]/members`
    - [x]Display: avatar (photoUrl), displayName, role badge (Creator / Leader / Member), joinedAt date
    - [x]Infinite scroll or "Load more" pagination
    - [x]Use existing `MemberCard` pattern or simple list items
  - [x]Files tab (`GroupFilesTab`):
    - [x]Fetch from `GET /api/v1/groups/[groupId]/files`
    - [x]Table/list: fileName, fileType icon, size (human-readable), uploaderName, uploadedAt, download link (`<a href={fileUrl} download>`)
    - [x]Empty state: "No files shared yet. Share files in channels to see them here."
  - [x]Update `src/app/[locale]/(app)/groups/[groupId]/page.tsx`:
    - [x]Replace `<GroupDetailStub />` with `<GroupDetail group={group} viewerMembership={...} viewerId={...} />`
    - [x]Fetch group details + viewer membership server-side (already has auth session)
    - [x]404 if group not found or soft-deleted
    - [x]Redirect non-members of hidden groups to 404 (don't reveal existence)

- [x] Task 11: PostComposer group support + existing component updates (AC: #1, #4)
  - [x]Modify `src/features/feed/actions/create-post.ts` (the server action):
    - [x]Add optional `groupId?: z.string().uuid().optional()` to `createPostSchema`
    - [x]When `groupId` is present in parsed data, call `createGroupPost(userId, groupId, input)` (from post-service, see Task 7) instead of `createFeedPost(input)`
    - [x]**IMPORTANT: PostComposer uses a SERVER ACTION (`createPost` from `../actions/create-post`), NOT a REST `fetch()`.** Do NOT change PostComposer to use `fetch()` — modify the server action to accept `groupId`.
  - [x]Modify `src/features/feed/components/PostComposer.tsx`:
    - [x]Add optional prop `groupId?: string`
    - [x]Pass `groupId` to `createPost({ ...input, groupId })` server action call (line 90)
    - [x]When `groupId` is present, hide visibility selector (group posts are always visible to group members)
  - [x]Modify `src/features/feed/components/FeedItem.tsx`:
    - [x]**Existing pin code**: FeedItem already has `isPinned` state (line 33), `handlePinToggle()` (line 38) which calls `fetch("/api/v1/posts/${post.id}/pin")`, and renders pinned label (line 98) + admin-only pin button gated by `{isAdmin && (` (line 140). This is the GLOBAL admin pin.
    - [x]Add optional `onPinToggle?: (postId: string, isPinned: boolean) => void` prop to `FeedItemProps`
    - [x]Change pin button visibility from `{isAdmin && (` to `{(isAdmin || onPinToggle) && (` — shows button for both platform admins and group leaders
    - [x]In `handlePinToggle()`: if `onPinToggle` prop is provided, call `onPinToggle(post.id, !isPinned)` instead of the existing inline `fetch("/api/v1/posts/${post.id}/pin")`. Keep the existing fetch as fallback for admin (global) pin context.
  - [x]Add `src/db/queries/posts.ts` function `togglePostPin(postId, isPinned)`:
    - [x]UPDATE `communityPosts SET is_pinned = $isPinned, pinned_at = CASE WHEN $isPinned THEN NOW() ELSE NULL END WHERE id = $postId`
    - [x]Returns updated post or null
    - [x]Check if the existing admin pin route (`/api/v1/posts/[postId]/pin`) already has this query function — if so, reuse it for both the admin route and the new group pin route (Task 8). If not, create it and refactor the admin route to use it too.

- [x] Task 12: Event types (AC: #2, #6)
  - [x]Add to `src/types/events.ts`:
    - [x]`GroupChannelCreatedEvent { groupId: string; channelId: string; createdBy: string; timestamp: string }` → `"group.channel_created"`
    - [x]`GroupChannelDeletedEvent { groupId: string; channelId: string; deletedBy: string; timestamp: string }` → `"group.channel_deleted"`
    - [x]Add both to `EventName` union and `EventMap`

- [x] Task 13: i18n (AC: #1-#6)
  - [x]Add to `messages/en.json` under `Groups` namespace:
    - [x]Tab labels: `"tabs.feed": "Feed"`, `"tabs.channels": "Channels"`, `"tabs.members": "Members"`, `"tabs.files": "Files"`
    - [x]Channel: `"channel.general": "General"`, `"channel.create": "Add Channel"`, `"channel.namePlaceholder": "Channel name"`, `"channel.descriptionPlaceholder": "Optional description"`, `"channel.delete": "Delete Channel"`, `"channel.confirmDelete": "Delete this channel? All messages will be archived."`, `"channel.maxChannelsReached": "Groups can have a maximum of 10 channels."`, `"channel.cannotDeleteGeneral": "The General channel cannot be deleted."`
    - [x]`"channel.selectPrompt": "Select a channel to start chatting"`
    - [x]Members: `"members.role.creator": "Creator"`, `"members.role.leader": "Leader"`, `"members.role.member": "Member"`, `"members.noMembers": "No members yet"`
    - [x]Files: `"files.noFiles": "No files shared yet. Share files in channels to see them here."`, `"files.download": "Download"`
    - [x]Feed: `"feed.pinned": "Pinned"`, `"feed.pin": "Pin post"`, `"feed.unpin": "Unpin post"`, `"feed.empty": "No posts yet. Be the first to post in this group!"`, `"feed.postingPermissionDenied": "Only group leaders can post in this group."`
    - [x]System messages: `"systemMessage.joined": "{name} joined the group"`, `"systemMessage.left": "{name} left the group"`
    - [x]Membership limit (leader addition): `"membershipLimitBlocked": "{name} has reached the maximum of {limit} groups and cannot be added."`
  - [x]Add matching Igbo translations to `messages/ig.json`

- [x] Task 14: Tests (all ACs)
  - [x]`src/db/queries/group-channels.test.ts` — unit tests for all query functions (mock db via vi.mock)
  - [x]`src/services/group-channel-service.test.ts` — createDefaultChannel (creates channel + conversation + adds members), createChannel (leader auth, count limit, member bulk-add), deleteChannel (leader auth, default-channel guard, soft-delete conversation), listChannelsForGroup
  - [x]Route tests:
    - [x]`src/app/api/v1/groups/[groupId]/posts/route.test.ts` — GET (200 member, 403 non-member), POST (201 success, 403 posting-permission-denied, 403 non-member)
    - [x]`src/app/api/v1/groups/[groupId]/channels/route.test.ts` — GET (200), POST 201 (leader), 403 (non-leader), 422 (max channels)
    - [x]`src/app/api/v1/groups/[groupId]/channels/[channelId]/route.test.ts` — DELETE 204 (leader), 403 (member), 403 (default channel), 404 (not found)
    - [x]`src/app/api/v1/groups/[groupId]/members/route.test.ts` — GET 200
    - [x]`src/app/api/v1/groups/[groupId]/files/route.test.ts` — GET 200 (member), 403 (non-member)
    - [x]`src/app/api/v1/groups/[groupId]/posts/[postId]/pin/route.test.ts` — PATCH 200 (leader), 403 (member), 404 (post not in group)
  - [x]`src/services/group-membership-service.test.ts` — extend existing tests with system message assertions (joinOpenGroup + leaveGroup now emit sendSystemMessage when channel exists; test both with and without default channel present)
  - [x]`src/features/groups/components/GroupDetail.test.tsx` — tab rendering (feed/channels/members/files), tab switching, channel sidebar renders General channel
  - [x]`src/features/feed/actions/create-post.test.ts` — extend existing tests: when `groupId` is provided, verify `createGroupPost` is called instead of `createFeedPost`
  - [x]`src/features/feed/components/PostComposer.test.tsx` — extend existing tests: when `groupId` prop is set, verify `createPost` server action is called with `groupId` in the input
  - [x]Route test patterns (follow Story 5.2):
    - [x]Mock `@/lib/rate-limiter` (`checkRateLimit → { allowed: true, limit: 10, remaining: 9, resetAt: new Date() }`, `buildRateLimitHeaders → {}`) and `@/lib/request-context` (`runWithContext: (_ctx, fn) => fn()`) — do NOT mock `withApiHandler`
    - [x]CSRF headers on all POST/PATCH/DELETE: `{ Host: "localhost:3000", Origin: "https://localhost:3000" }`
    - [x]`mockReset()` (not `clearAllMocks()`) in `beforeEach` for `mockResolvedValueOnce` sequences
    - [x]Import `ApiError` directly from `@/lib/api-error` (no mock — it has zero imports)
    - [x]Route param extraction: `URL.pathname.split("/")` — channel routes have deeper nesting

## Dev Notes

### Existing Code — What to Reuse vs. Create

**Reuse as-is (no modifications):**

- `ChatWindow` from `@/features/chat` — takes `conversationId`; handles all real-time messaging, reactions, threading, attachments, search. **Do NOT rewrite for group channels.** Just pass the channel's `conversationId`.
- `messageService.sendSystemMessage()` at `src/services/message-service.ts:250` — existing, tested, works for any conversationId
- `FEED_SELECT_COLUMNS` + `_assemblePostPage()` in `src/db/queries/feed.ts` — these are **module-private** (not exported), so `getGroupFeedPosts()` MUST be added inside the same file (`feed.ts`) to access them; no duplication
- `GroupHeader`, `GroupSettings`, `GroupCard`, `GroupList` — no changes needed
- `getGroupMember(groupId, userId)` — role/status check
- `getGroupById(groupId)` — includes soft-delete filter

**Must create:**

- `src/db/schema/community-group-channels.ts` — new schema
- `src/db/queries/group-channels.ts` — new query file
- `src/services/group-channel-service.ts` — new service
- `src/features/groups/components/GroupDetail.tsx` — replaces GroupDetailStub (keep stub file, update page.tsx to import GroupDetail instead)

**Must modify:**

- `src/db/schema/chat-conversations.ts` — add `channelId` column + relation (preserve all existing code)
- `src/db/index.ts` — add new schema import
- `src/db/queries/feed.ts` — add `getGroupFeedPosts()` (FEED_SELECT_COLUMNS/\_assemblePostPage are module-private — function must go in this file)
- `src/db/queries/posts.ts` — add `togglePostPin(postId, isPinned)`
- `src/db/queries/groups.ts` — add `listActiveGroupMembers()`
- `src/services/group-service.ts` — extend `createGroupForUser()` to call `createDefaultChannel()`
- `src/services/group-membership-service.ts` — add system messages to `joinOpenGroup()`, `approveJoinRequest()`, `leaveGroup()`
- `src/server/realtime/` EventBus bridge — add `group.member_joined`/`group.member_left` socket room handlers
- `src/features/feed/components/PostComposer.tsx` — add optional `groupId` prop
- `src/features/feed/components/FeedItem.tsx` — add group-level pin button
- `src/types/events.ts` — add 2 new event types
- `src/app/[locale]/(app)/groups/[groupId]/page.tsx` — replace GroupDetailStub with GroupDetail
- `src/services/rate-limiter.ts` — add `GROUP_CHANNEL`, `GROUP_MANAGE` presets

### Critical Technical Details

**`channel_id` in chat_conversations is nullable:**
Not all conversations have a channel (direct messages, group DMs have no channelId). The column is nullable. Queries that filter by `channelId` must use `IS NOT NULL` guards.

**`conversation_type = "channel"` already defined:**
The `conversationTypeEnum` in `chat-conversations.ts` already includes `"channel"` (established in Story 2.1 as a forward-declaration for Epic 5). No enum migration needed.

**createDefaultChannel must be idempotent:**
If called twice for the same group (e.g., retry), `createGroupChannel` should `ON CONFLICT DO NOTHING` on `(group_id, is_default = TRUE)`. Add a unique index: `CREATE UNIQUE INDEX ON community_group_channels(group_id) WHERE is_default = TRUE` in the migration.

**Socket.IO room join pattern (from Story 2.3):**
The EventBus bridge is at `src/server/realtime/subscribers/eventbus-bridge.ts`. It uses `chatNs.in(ROOM_USER(userId)).socketsJoin(room)` (line 175) and `.socketsLeave(room)` (line 212). The bridge listens for EventBus events like `"conversation.member_added"` and `"conversation.member_left"` to manage socket rooms. For group channels, subscribe to `"group.member_joined"` / `"group.member_left"` and join/leave all channel conversation rooms for that group.

**getDefaultChannelConversationId returns null when channel doesn't exist:**
During `joinOpenGroup()` for groups created before Story 5.3 (no channels yet), this returns null → skip system message. The `if (conversationId)` guard in group-membership-service handles this correctly.

**System message text is plain English (known limitation):**
Task 5 uses hardcoded English strings like `"${name} joined the group"` stored in `chat_messages.content`. This matches the existing pattern from Story 2.3 (e.g., `sendSystemMessage(conversationId, userId, "${name} joined the conversation")`). The bilingual platform stores system messages in English only — this is a known limitation consistent with prior stories. Do NOT attempt to i18n system messages stored in the DB.

**PostComposer uses a SERVER ACTION, not REST fetch:**
The existing `PostComposer` (line 90) calls `await createPost({...})` — a **server action** imported from `../actions/create-post.ts`. It does NOT use `fetch()`. When `groupId` is provided, pass it to the same `createPost` server action: `createPost({ ...input, groupId })`. The server action then routes to `createGroupPost()` in post-service when `groupId` is present. Do NOT switch PostComposer to use `fetch()` — that would break the established pattern.

**Group feed vs. global feed separation:**
`src/db/queries/feed.ts` line ~247 already excludes group posts from the global feed: `sql\`${communityPosts.groupId} IS NULL\``. The new `getGroupFeedPosts()`does the inverse:`eq(communityPosts.groupId, groupId)`.

**Pinning in group context vs. global admin pin:**

- Global pin (Story 4.4): `PATCH /api/v1/posts/[postId]/pin` requires `session.user.role === "ADMIN"` — existing `handlePinToggle()` in FeedItem (line 38) calls this route, gated by `isAdmin` check (line 140)
- Group pin (Story 5.3): `PATCH /api/v1/groups/[groupId]/posts/[postId]/pin` requires group leader/creator role
- These are separate routes. Group leaders are NOT platform admins.
- FeedItem must support BOTH: when `onPinToggle` prop is provided (group context), use it; otherwise fall back to existing admin pin behavior. See Task 11 for details.

**`communityGroupChannels` table location in schema comment:**
The architecture doc (`architecture.md:1011`) says `community-groups.ts` will contain `groups, group_members, group_channels`. However, keeping them separate (per existing story 5.1 pattern) is cleaner. Create `community-group-channels.ts` as a dedicated file and note the deviation in a comment.

**`listActiveGroupMembers` cursor pagination:**
Use `joinedAt` ISO string as cursor (oldest members first). Consistent with other cursor patterns. If `cursor` provided: `WHERE joined_at > cursor::timestamptz`. Max limit: 50 per page.

**Files tab scope:**
Only files from group **channels** (via `chat_message_attachments`) are aggregated. Files embedded in group **posts** (Tiptap JSON images) are not included — Tiptap images are inline content, not trackable attachments. Document this limitation in the Files tab empty state when there are channel attachments but no post files.

**`addMembersToConversation` for new channels:**
When a new channel is created, all existing active group members must be added to its conversation so they can send/receive messages. This bulk-insert uses `ON CONFLICT DO NOTHING` for idempotency. Groups have no inherent member cap (only per-user cap of 40), so a group could have hundreds of members. For large groups, consider batching the INSERT in chunks of 100 to avoid query size limits. Acceptable as single batch for MVP.

**Zod validation for channel name:**

```typescript
import { z } from "zod/v4";
const createChannelSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});
const parsed = createChannelSchema.safeParse(body);
if (!parsed.success) throw new ApiError({ status: 400, title: parsed.error.issues[0].message });
```

### Route Param Extraction

All routes use `new URL(request.url).pathname.split("/")`:

| Route                                  | groupId index | channelId/postId index |
| -------------------------------------- | ------------- | ---------------------- |
| `/api/v1/groups/{gId}/posts`           | `.at(-2)`     | —                      |
| `/api/v1/groups/{gId}/posts/{pId}/pin` | `.at(-4)`     | `.at(-2)` (postId)     |
| `/api/v1/groups/{gId}/channels`        | `.at(-2)`     | —                      |
| `/api/v1/groups/{gId}/channels/{cId}`  | `.at(-3)`     | `.at(-1)` (channelId)  |
| `/api/v1/groups/{gId}/members`         | `.at(-2)`     | —                      |
| `/api/v1/groups/{gId}/files`           | `.at(-2)`     | —                      |

### Architecture Compliance

- API routes: `withApiHandler()` + RFC 7807 errors via `errorResponse()`/`ApiError` + `requireAuthenticatedSession()`
- Services: `src/services/` with `import "server-only"`, emit events via EventBus (never from routes)
- DB access: `src/db/queries/` — no inline SQL in services, no direct `db` import in services (use query functions)
- Migrations: hand-written SQL only — drizzle-kit generate fails with `server-only` error
- Zod: import from `"zod/v4"`, error access via `parsed.error.issues[0]`
- Error throwing: `throw new ApiError({ title, status, detail })` from `@/lib/api-error`
- EventBus: emit from services, never from routes or query files
- i18n: all user-facing strings via `useTranslations()` — no hardcoded English strings in components
- DB schema: import in `src/db/index.ts` with `import * as xSchema from "./schema/x"` pattern

### Test Count Baseline

- Before Story 5.3: ~2555/2570 passing (same 15 pre-existing failures in suggestion-service/FileUpload/use-file-attachment)
- Target: +60–80 new tests (service tests, route tests, component tests)

### Pre-Existing Failures (do NOT investigate)

15 pre-existing test failures in: `suggestion-service` (10), `FileUpload` (2), `use-file-attachment` (3) — these existed before Story 5.1, are unrelated to groups, and must not be broken further.

### File Structure

New files:

- `src/db/schema/community-group-channels.ts`
- `src/db/migrations/0024_group_channels.sql`
- `src/db/queries/group-channels.ts`
- `src/db/queries/group-channels.test.ts`
- `src/services/group-channel-service.ts`
- `src/services/group-channel-service.test.ts`
- `src/features/groups/components/GroupDetail.tsx`
- `src/features/groups/components/GroupDetail.test.tsx`
- `src/features/groups/components/GroupFeedTab.tsx`
- `src/features/groups/components/GroupChannelsTab.tsx`
- `src/features/groups/components/GroupMembersTab.tsx`
- `src/features/groups/components/GroupFilesTab.tsx`
- `src/app/api/v1/groups/[groupId]/posts/route.ts`
- `src/app/api/v1/groups/[groupId]/posts/route.test.ts`
- `src/app/api/v1/groups/[groupId]/posts/[postId]/pin/route.ts`
- `src/app/api/v1/groups/[groupId]/posts/[postId]/pin/route.test.ts`
- `src/app/api/v1/groups/[groupId]/channels/route.ts`
- `src/app/api/v1/groups/[groupId]/channels/route.test.ts`
- `src/app/api/v1/groups/[groupId]/channels/[channelId]/route.ts`
- `src/app/api/v1/groups/[groupId]/channels/[channelId]/route.test.ts`
- `src/app/api/v1/groups/[groupId]/members/route.ts`
- `src/app/api/v1/groups/[groupId]/members/route.test.ts`
- `src/app/api/v1/groups/[groupId]/files/route.ts`
- `src/app/api/v1/groups/[groupId]/files/route.test.ts`

Modified files:

- `src/db/schema/chat-conversations.ts` (add channelId + relation)
- `src/db/index.ts` (add communityGroupChannelsSchema import)
- `src/db/queries/feed.ts` (add getGroupFeedPosts)
- `src/db/queries/posts.ts` (add togglePostPin)
- `src/db/queries/groups.ts` (add listActiveGroupMembers)
- `src/services/group-service.ts` (createGroupForUser → createDefaultChannel)
- `src/services/group-membership-service.ts` (system messages for join/leave/approve)
- `src/services/group-membership-service.test.ts` (extend with system message assertions)
- `src/server/realtime/subscribers/eventbus-bridge.ts` (add group.member_joined/left → socketsJoin/Leave for channel rooms)
- `src/services/rate-limiter.ts` (add GROUP_CHANNEL, GROUP_MANAGE presets)
- `src/types/events.ts` (add GroupChannelCreatedEvent, GroupChannelDeletedEvent)
- `src/features/feed/actions/create-post.ts` (add optional groupId to server action schema + route to createGroupPost)
- `src/features/feed/components/PostComposer.tsx` (add groupId prop, pass to server action)
- `src/features/feed/components/FeedItem.tsx` (add onPinToggle prop for group pin, coexist with existing admin pin)
- `src/features/groups/index.ts` (export GroupDetail, tab components, GroupChannelItem)
- `src/app/[locale]/(app)/groups/[groupId]/page.tsx` (replace GroupDetailStub with GroupDetail)
- `messages/en.json` (Groups namespace additions)
- `messages/ig.json` (Igbo translations)

### References

- Story requirements: `_bmad-output/planning-artifacts/epics.md` → Story 5.3 (lines 1950–1992)
- Epic 5 overview: `_bmad-output/planning-artifacts/epics.md` → Epic 5 (line 1881)
- Previous story context: `_bmad-output/implementation-artifacts/5-2-group-discovery-membership.md`
- Group schema: `src/db/schema/community-groups.ts`
- Chat conversations schema: `src/db/schema/chat-conversations.ts` (type enum already has "channel")
- Chat message attachments: `src/db/schema/chat-message-attachments.ts`
- Feed query patterns: `src/db/queries/feed.ts` (FEED_SELECT_COLUMNS, \_assemblePostPage)
- Group queries: `src/db/queries/groups.ts`
- Group membership service: `src/services/group-membership-service.ts`
- Group service: `src/services/group-service.ts`
- Message service: `src/services/message-service.ts` (sendSystemMessage at line 250)
- Rate limiter presets: `src/services/rate-limiter.ts`
- EventBus bridge: `src/server/realtime/subscribers/eventbus-bridge.ts` (socketsJoin at line 175, socketsLeave at line 212)
- Architecture notes: `_bmad-output/planning-artifacts/architecture.md` line 1011

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

N/A

### Completion Notes List

- All 14 tasks implemented and passing
- Code review fixes applied: H-1 (successResponse `.data` unwrap in all 4 tab components), H-2 (hardcoded English → i18n `t()` calls), H-3 (createGroupPost unit tests added), H-4 (approveJoinRequest system message test added), M-3 (removed unused body from pin handler), M-4 (PostComposer invalidates `["group-feed", groupId]` when groupId present), GroupDetail.test.tsx assertions updated for i18n keys
- Test count: 2635/2650 passing (+80 new tests; 15 pre-existing failures unchanged)
- M-1 (confirm() vs AlertDialog in GroupChannelsTab) noted as acceptable for MVP — matches browser-native pattern

### File List

New files:

- `src/db/schema/community-group-channels.ts`
- `src/db/migrations/0024_group_channels.sql`
- `src/db/queries/group-channels.ts`
- `src/db/queries/group-channels.test.ts`
- `src/services/group-channel-service.ts`
- `src/services/group-channel-service.test.ts`
- `src/features/groups/components/GroupDetail.tsx`
- `src/features/groups/components/GroupDetail.test.tsx`
- `src/features/groups/components/GroupFeedTab.tsx`
- `src/features/groups/components/GroupChannelsTab.tsx`
- `src/features/groups/components/GroupMembersTab.tsx`
- `src/features/groups/components/GroupFilesTab.tsx`
- `src/app/api/v1/groups/[groupId]/posts/route.ts`
- `src/app/api/v1/groups/[groupId]/posts/route.test.ts`
- `src/app/api/v1/groups/[groupId]/posts/[postId]/pin/route.ts`
- `src/app/api/v1/groups/[groupId]/posts/[postId]/pin/route.test.ts`
- `src/app/api/v1/groups/[groupId]/channels/route.ts`
- `src/app/api/v1/groups/[groupId]/channels/route.test.ts`
- `src/app/api/v1/groups/[groupId]/channels/[channelId]/route.ts`
- `src/app/api/v1/groups/[groupId]/channels/[channelId]/route.test.ts`
- `src/app/api/v1/groups/[groupId]/members/route.ts`
- `src/app/api/v1/groups/[groupId]/members/route.test.ts`
- `src/app/api/v1/groups/[groupId]/files/route.ts`
- `src/app/api/v1/groups/[groupId]/files/route.test.ts`

Modified files:

- `src/db/schema/chat-conversations.ts`
- `src/db/index.ts`
- `src/db/queries/feed.ts`
- `src/db/queries/posts.ts`
- `src/db/queries/groups.ts`
- `src/services/group-service.ts`
- `src/services/group-service.test.ts`
- `src/services/group-membership-service.ts`
- `src/services/group-membership-service.test.ts`
- `src/services/post-service.ts`
- `src/services/post-service.test.ts`
- `src/server/realtime/subscribers/eventbus-bridge.ts`
- `src/server/realtime/subscribers/eventbus-bridge.test.ts`
- `src/server/realtime/integration/notification-flow.test.ts`
- `src/services/rate-limiter.ts`
- `src/types/events.ts`
- `src/features/feed/actions/create-post.ts`
- `src/features/feed/components/PostComposer.tsx`
- `src/features/feed/components/FeedItem.tsx`
- `src/features/groups/index.ts`
- `src/app/[locale]/(app)/groups/[groupId]/page.tsx`
- `messages/en.json`
- `messages/ig.json`
