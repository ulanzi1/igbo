// NOTE: No "server-only" — consistent with other query files (follows.ts, block-mute.ts, groups.ts)
import { eq } from "drizzle-orm";
import { db } from "../index";
import { platformSettings } from "../schema/platform-settings";

/**
 * Get a platform setting by key. Returns the parsed JSONB value, or the fallback
 * if the row is missing or the value cannot be used as type T.
 */
export async function getPlatformSetting<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, key))
    .limit(1);

  if (!row) return fallback;

  // The JSONB column stores arbitrary JSON — validate it matches the expected type.
  // Guard against null: typeof null === typeof {} which would incorrectly pass for object fallbacks.
  const val = row.value;
  if (val !== null && typeof val === typeof fallback) {
    return val as T;
  }

  return fallback;
}

/**
 * Upsert a platform setting by key.
 * When updatedBy is provided, sets the updatedBy and updatedAt fields.
 */
export async function upsertPlatformSetting(
  key: string,
  value: string | number | boolean | null | object,
  updatedBy?: string,
): Promise<void> {
  await db
    .insert(platformSettings)
    .values({
      key,
      value,
      updatedBy: updatedBy ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: {
        value,
        updatedBy: updatedBy ?? null,
        updatedAt: new Date(),
      },
    });
}
