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
  },
});

export type Database = typeof db;
