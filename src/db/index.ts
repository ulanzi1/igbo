import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as platformSettingsSchema from "./schema/platform-settings";
import * as authUsersSchema from "./schema/auth-users";
import * as auditLogsSchema from "./schema/audit-logs";
import * as authSessionsSchema from "./schema/auth-sessions";
import * as authMfaSchema from "./schema/auth-mfa";
import * as authPasswordResetSchema from "./schema/auth-password-reset";
import * as communityProfilesSchema from "./schema/community-profiles";
import * as authPermissionsSchema from "./schema/auth-permissions";
import * as gdprSchema from "./schema/gdpr";
import * as fileUploadsSchema from "./schema/file-uploads";
import * as platformNotificationsSchema from "./schema/platform-notifications";
import * as platformSocialSchema from "./schema/platform-social";
import * as chatConversationsSchema from "./schema/chat-conversations";
import * as chatMessagesSchema from "./schema/chat-messages";
import * as chatMessageAttachmentsSchema from "./schema/chat-message-attachments";
import * as chatMessageReactionsSchema from "./schema/chat-message-reactions";
import * as communityConnectionsSchema from "./schema/community-connections";
import * as communityPostsSchema from "./schema/community-posts";
import * as postInteractionsSchema from "./schema/post-interactions";
import * as bookmarksSchema from "./schema/bookmarks";
import * as communityGroupsSchema from "./schema/community-groups";
import * as communityGroupChannelsSchema from "./schema/community-group-channels";
import * as groupModerationLogsSchema from "./schema/group-moderation-logs";
import * as communityArticlesSchema from "./schema/community-articles";
import * as communityArticleCommentsSchema from "./schema/community-article-comments";
import * as communityEventsSchema from "./schema/community-events";
import * as platformPointsSchema from "./schema/platform-points";
import * as communityBadgesSchema from "./schema/community-badges";
import * as postingLimitsSchema from "./schema/platform-posting-limits";
import * as pushSubscriptionsSchema from "./schema/platform-push-subscriptions";
import * as notifPrefsSchema from "./schema/platform-notification-preferences";
import * as dismissedRecsSchema from "./schema/platform-dismissed-recommendations";
import * as moderationSchema from "./schema/moderation";
import * as reportsSchema from "./schema/reports";

const client = postgres(env.DATABASE_URL, {
  max: env.DATABASE_POOL_SIZE,
});

export const db = drizzle(client, {
  schema: {
    ...platformSettingsSchema,
    ...authUsersSchema,
    ...auditLogsSchema,
    ...authSessionsSchema,
    ...authMfaSchema,
    ...authPasswordResetSchema,
    ...communityProfilesSchema,
    ...authPermissionsSchema,
    ...gdprSchema,
    ...fileUploadsSchema,
    ...platformNotificationsSchema,
    ...platformSocialSchema,
    ...chatConversationsSchema,
    ...chatMessagesSchema,
    ...chatMessageAttachmentsSchema,
    ...chatMessageReactionsSchema,
    ...communityConnectionsSchema,
    ...communityPostsSchema,
    ...postInteractionsSchema,
    ...bookmarksSchema,
    ...communityGroupsSchema,
    ...communityGroupChannelsSchema,
    ...groupModerationLogsSchema,
    ...communityArticlesSchema,
    ...communityArticleCommentsSchema,
    ...communityEventsSchema,
    ...platformPointsSchema,
    ...communityBadgesSchema,
    ...postingLimitsSchema,
    ...pushSubscriptionsSchema,
    ...notifPrefsSchema,
    ...dismissedRecsSchema,
    ...moderationSchema,
    ...reportsSchema,
  },
});

export type Database = typeof db;
