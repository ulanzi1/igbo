import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { registerJob } from "@/server/jobs/job-runner";
import { db } from "@/db";
import { gdprExportRequests } from "@/db/schema/gdpr";
import { authUsers } from "@/db/schema/auth-users";
import { communityProfiles, communitySocialLinks } from "@/db/schema/community-profiles";
import { getRedisClient } from "@/lib/redis";
import { eventBus } from "@/services/event-bus";
import { enqueueEmailJob } from "@/services/email-service";
import { env } from "@/env";

const INCLUDE_RECEIVED_MESSAGES = process.env.INCLUDE_RECEIVED_MESSAGES_IN_EXPORT === "true";
const DOWNLOAD_TOKEN_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours

registerJob("data-export", async () => {
  // Find all pending export requests
  const pendingRequests = await db
    .select()
    .from(gdprExportRequests)
    .where(eq(gdprExportRequests.status, "pending"));

  for (const request of pendingRequests) {
    try {
      await processExportRequest(request.id, request.userId);
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "gdpr.export.process.failed",
          requestId: request.id,
          userId: request.userId,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }
});

async function processExportRequest(requestId: string, userId: string): Promise<void> {
  // Load user data
  const [user] = await db.select().from(authUsers).where(eq(authUsers.id, userId)).limit(1);

  if (!user) {
    throw new Error(`User ${userId} not found — cannot generate export`);
  }

  const [profile] = await db
    .select()
    .from(communityProfiles)
    .where(eq(communityProfiles.userId, userId))
    .limit(1);

  const socialLinks = await db
    .select()
    .from(communitySocialLinks)
    .where(eq(communitySocialLinks.userId, userId));

  // Assemble export data
  const exportData = {
    exportedAt: new Date().toISOString(),
    profile: {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      locationCity: user.locationCity,
      locationState: user.locationState,
      locationCountry: user.locationCountry,
      membershipTier: user.membershipTier,
      languagePreference: user.languagePreference,
      createdAt: user.createdAt,
    },
    communityProfile: profile
      ? {
          displayName: profile.displayName,
          bio: profile.bio,
          locationCity: profile.locationCity,
          locationState: profile.locationState,
          locationCountry: profile.locationCountry,
          interests: profile.interests,
          culturalConnections: profile.culturalConnections,
          languages: profile.languages,
          profileVisibility: profile.profileVisibility,
        }
      : null,
    socialLinks: socialLinks.map((link) => ({
      provider: link.provider,
      displayName: link.providerDisplayName,
      profileUrl: link.providerProfileUrl,
      linkedAt: link.linkedAt,
    })),
    // TODO(Story 4.x): populate with authored posts when post schema exists
    posts: [] as unknown[],
    // TODO(Story 6.x): populate with authored articles when article schema exists
    articles: [] as unknown[],
    // TODO(Story 4.x): populate with authored comments when comment schema exists
    comments: [] as unknown[],
    // TODO(Story 7.x): populate with event RSVPs when event schema exists
    eventRsvps: [] as unknown[],
    // TODO(Story 8.x): populate with points history when points schema exists
    pointsHistory: [] as unknown[],
    // TODO(Story 9.x): populate with notification preferences when notification schema exists
    notificationPreferences: null as unknown,
    // Sent messages: included with recipient anonymization (controlled by feature flag)
    // TODO(Story 2.x): populate sent messages when message schema exists
    sentMessages: [] as unknown[],
    // Received messages: excluded by default per legal review requirement
    // Feature flag: INCLUDE_RECEIVED_MESSAGES_IN_EXPORT (default: false)
    // See docs/gdpr-breach-runbook.md — legal review required before enabling
    ...(INCLUDE_RECEIVED_MESSAGES
      ? {
          // TODO(Story 2.x): populate received messages when message schema exists
          receivedMessages: [] as unknown[],
        }
      : {}),
  };

  // Generate download token and set expiry
  const downloadToken = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + DOWNLOAD_TOKEN_TTL_MS);
  const completedAt = new Date();

  await db
    .update(gdprExportRequests)
    .set({
      status: "ready",
      downloadToken,
      exportData,
      expiresAt,
      completedAt,
    })
    .where(eq(gdprExportRequests.id, requestId));

  // Emit event (Story 9.1 will deliver in-app notification; for now send email)
  eventBus.emit("gdpr.export_ready", {
    userId,
    requestId,
    timestamp: new Date().toISOString(),
  });

  // Notify user that export is ready
  enqueueEmailJob(`gdpr-export-ready-${requestId}`, {
    to: user.email,
    subject: "Your data export is ready",
    templateId: "gdpr-export-ready",
    data: {
      name: user.name ?? user.email,
      downloadToken,
      expiresAt: expiresAt.toISOString(),
      downloadUrl: `${env.NEXT_PUBLIC_APP_URL}/api/v1/gdpr/download?token=${downloadToken}`,
    },
  });

  // Clean up Redis key
  const redis = getRedisClient();
  await redis.del(`gdpr:export:${userId}`);
}
