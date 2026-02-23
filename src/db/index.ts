import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as platformSettingsSchema from "./schema/platform-settings";
import * as authUsersSchema from "./schema/auth-users";

const client = postgres(env.DATABASE_URL, {
  max: env.DATABASE_POOL_SIZE,
});

export const db = drizzle(client, {
  schema: {
    ...platformSettingsSchema,
    ...authUsersSchema,
  },
});

export type Database = typeof db;
