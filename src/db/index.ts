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
  },
});

export type Database = typeof db;
