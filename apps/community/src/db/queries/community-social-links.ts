import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { communitySocialLinks } from "@/db/schema/community-profiles";

type SocialProvider = "FACEBOOK" | "LINKEDIN" | "TWITTER" | "INSTAGRAM";

/** Upsert a social link for a user/provider pair. */
export async function upsertSocialLink(
  userId: string,
  provider: SocialProvider,
  data: { providerDisplayName: string; providerProfileUrl: string },
) {
  const now = new Date();
  const [link] = await db
    .insert(communitySocialLinks)
    .values({
      userId,
      provider,
      providerDisplayName: data.providerDisplayName,
      providerProfileUrl: data.providerProfileUrl,
      linkedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [communitySocialLinks.userId, communitySocialLinks.provider],
      set: {
        providerDisplayName: data.providerDisplayName,
        providerProfileUrl: data.providerProfileUrl,
        updatedAt: now,
      },
    })
    .returning();
  return link ?? null;
}

/** Delete a social link for a user/provider pair. */
export async function deleteSocialLink(userId: string, provider: SocialProvider) {
  await db
    .delete(communitySocialLinks)
    .where(
      and(eq(communitySocialLinks.userId, userId), eq(communitySocialLinks.provider, provider)),
    );
}

/** Get all social links for a user ordered by linkedAt asc. */
export async function getSocialLinksByUserId(userId: string) {
  return db
    .select()
    .from(communitySocialLinks)
    .where(eq(communitySocialLinks.userId, userId))
    .orderBy(asc(communitySocialLinks.linkedAt));
}
