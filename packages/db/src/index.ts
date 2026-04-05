import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
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
import * as memberDisciplineSchema from "./schema/member-discipline";
import * as analyticsSnapshotsSchema from "./schema/platform-analytics-snapshots";
import * as governanceDocumentsSchema from "./schema/platform-governance-documents";
import * as portalCompanyProfilesSchema from "./schema/portal-company-profiles";
import * as portalJobPostingsSchema from "./schema/portal-job-postings";
import * as portalApplicationsSchema from "./schema/portal-applications";

const schemaMap = {
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
  ...memberDisciplineSchema,
  ...analyticsSnapshotsSchema,
  ...governanceDocumentsSchema,
  ...portalCompanyProfilesSchema,
  ...portalJobPostingsSchema,
  ...portalApplicationsSchema,
};

/** Factory — for tests and custom connection strings */
export function createDb(connectionString: string, poolSize?: number) {
  const client = postgres(connectionString, { max: poolSize ?? 10 });
  return drizzle(client, { schema: schemaMap });
}

/** Lazy singleton — reads DATABASE_URL at first property access */
let _db: ReturnType<typeof createDb> | null = null;

function ensureDb(): ReturnType<typeof createDb> {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required");
    }
    const poolSize = process.env.DATABASE_POOL_SIZE
      ? parseInt(process.env.DATABASE_POOL_SIZE, 10)
      : 10;
    _db = createDb(process.env.DATABASE_URL, poolSize);
  }
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_, prop) {
    return (ensureDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
  has(_, prop) {
    return prop in (ensureDb() as object);
  },
  // Forward prototype chain so `db instanceof PgDatabase` works (needed for Auth.js adapter)
  getPrototypeOf() {
    return Object.getPrototypeOf(ensureDb()) as object;
  },
});

export type Database = ReturnType<typeof createDb>;
