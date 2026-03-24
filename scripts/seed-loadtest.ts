/**
 * Load test synthetic data seeder (Story 12.6)
 *
 * Seeds 10,000 members, 100,000 posts, 500,000 messages, and 1,000 groups
 * into the load test database for realistic query performance testing.
 *
 * Usage: bun run scripts/seed-loadtest.ts
 * Target DB: LOADTEST_DATABASE_URL env var (defaults to localhost:5432/igbo_loadtest)
 *
 * IMPORTANT: Uses a dedicated Drizzle instance — NOT the app's db from @/db.
 * The app db points to the dev database; this seeder targets the loadtest DB.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { faker } from "@faker-js/faker";
import { randomUUID } from "crypto";

// Import schema tables directly — no server-only imports via @/db
import { authUsers } from "../src/db/schema/auth-users";
import { communityProfiles } from "../src/db/schema/community-profiles";
import { communityMemberFollows } from "../src/db/schema/community-connections";
import { communityGroups, communityGroupMembers } from "../src/db/schema/community-groups";
import { communityGroupChannels } from "../src/db/schema/community-group-channels";
import { communityPosts } from "../src/db/schema/community-posts";
import { chatConversations, chatConversationMembers } from "../src/db/schema/chat-conversations";
import { chatMessages } from "../src/db/schema/chat-messages";

// ─────────────────────────────────────────────────────────────────────────────
// DB connection — dedicated loadtest instance, never the app's DATABASE_URL
// ─────────────────────────────────────────────────────────────────────────────

const LOADTEST_DB_URL =
  process.env.LOADTEST_DATABASE_URL ?? "postgres://postgres:password@localhost:5432/igbo_loadtest";

const client = postgres(LOADTEST_DB_URL, { max: 10 });
const db = drizzle(client);

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const MEMBER_COUNT = 10_000;
const POST_COUNT = 100_000;
const GROUP_COUNT = 1_000;
const TARGET_MESSAGE_COUNT = 500_000;
const BATCH_SIZE = 1_000;
const KNOWN_USER_COUNT = 20;
const KNOWN_PASSWORD = "LoadTest123!";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/** Power-law random: most values are small, a few are large */
function powerLawRandom(min: number, max: number, exponent = 2): number {
  const u = Math.random();
  return Math.floor(min + (max - min) * Math.pow(u, exponent));
}

function randomPastDate(daysBack = 180): Date {
  const now = Date.now();
  const past = now - Math.random() * daysBack * 24 * 60 * 60 * 1000;
  return new Date(past);
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Idempotency check
// ─────────────────────────────────────────────────────────────────────────────

async function isAlreadySeeded(): Promise<boolean> {
  const result = await db.select({ id: authUsers.id }).from(authUsers).limit(5001);
  return result.length > 5000;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Members (10,000)
// ─────────────────────────────────────────────────────────────────────────────

async function seedMembers(): Promise<string[]> {
  console.info("Phase 1: Seeding members...");

  const passwordHash = await bcrypt.hash(KNOWN_PASSWORD, 12);
  const now = new Date();
  const userIds: string[] = [];

  // Known test users (loadtest-1 through loadtest-20)
  const knownUserRows = Array.from({ length: KNOWN_USER_COUNT }, (_, i) => {
    const id = randomUUID();
    userIds.push(id);
    return {
      id,
      email: `loadtest-${i + 1}@test.local`,
      emailVerified: now,
      name: `Load Test User ${i + 1}`,
      culturalConnection: "Igbo diaspora",
      reasonForJoining: "Load testing",
      consentGivenAt: now,
      consentVersion: "1.0",
      accountStatus: "APPROVED" as const,
      passwordHash,
      role: "MEMBER" as const,
      membershipTier: "STANDARD" as const,
      languagePreference: "en",
      createdAt: now,
      updatedAt: now,
    };
  });

  await db.insert(authUsers).values(knownUserRows).onConflictDoNothing();

  // Bulk members — 500 per batch
  const BULK_COUNT = MEMBER_COUNT - KNOWN_USER_COUNT;
  const allBulkRows = Array.from({ length: BULK_COUNT }, () => {
    const id = randomUUID();
    userIds.push(id);
    const roleRoll = Math.random();
    const role =
      roleRoll < 0.01
        ? ("ADMIN" as const)
        : roleRoll < 0.03
          ? ("MODERATOR" as const)
          : ("MEMBER" as const);
    return {
      id,
      email: faker.internet.email().toLowerCase(),
      emailVerified: new Date(),
      name: faker.person.fullName(),
      phone: faker.phone.number(),
      locationCity: faker.location.city(),
      locationState: faker.location.state(),
      locationCountry: faker.location.countryCode(),
      culturalConnection: faker.helpers.arrayElement([
        "Igbo heritage",
        "Igbo diaspora",
        "Cultural learner",
        "Connected through family",
      ]),
      reasonForJoining: faker.lorem.sentence(),
      referralName: Math.random() < 0.3 ? faker.person.firstName() : null,
      consentGivenAt: randomPastDate(365),
      consentVersion: "1.0",
      accountStatus: "APPROVED" as const,
      passwordHash: null,
      role,
      membershipTier:
        Math.random() < 0.7
          ? ("BASIC" as const)
          : Math.random() < 0.8
            ? ("STANDARD" as const)
            : ("PREMIUM" as const),
      languagePreference: Math.random() < 0.2 ? "ig" : "en",
      createdAt: randomPastDate(365),
      updatedAt: new Date(),
    };
  });

  for (const batch of chunk(allBulkRows, 500)) {
    await db.insert(authUsers).values(batch).onConflictDoNothing();
  }

  // Insert community profiles for all users
  const profileRows = userIds.map((userId) => ({
    id: randomUUID(),
    userId,
    displayName: faker.person.fullName(),
    bio: Math.random() < 0.5 ? faker.lorem.sentences(2) : null,
    locationCity: faker.location.city(),
    locationCountry: faker.location.countryCode(),
    interests: faker.helpers.arrayElements(
      ["culture", "music", "food", "history", "language", "arts", "sports"],
      { min: 0, max: 4 },
    ),
    culturalConnections: faker.helpers.arrayElements(["Imo", "Anambra", "Enugu", "Abia"], {
      min: 0,
      max: 2,
    }),
    languages: faker.helpers.arrayElements(["en", "ig", "fr"], { min: 1, max: 2 }),
    profileCompletedAt: Math.random() < 0.25 ? randomPastDate(300) : null,
    profileVisibility: faker.helpers.arrayElement([
      "PUBLIC_TO_MEMBERS",
      "PUBLIC_TO_MEMBERS",
      "LIMITED",
    ] as const),
    locationVisible: Math.random() < 0.8,
    followerCount: 0,
    followingCount: 0,
    createdAt: randomPastDate(365),
    updatedAt: new Date(),
  }));

  for (const batch of chunk(profileRows, BATCH_SIZE)) {
    await db.insert(communityProfiles).values(batch).onConflictDoNothing();
  }

  console.info(`  ✓ ${userIds.length} members + profiles inserted`);
  return userIds;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — Social graph (~50,000 follows)
// ─────────────────────────────────────────────────────────────────────────────

async function seedSocialGraph(userIds: string[]): Promise<void> {
  console.info("Phase 2: Seeding social graph...");

  const seen = new Set<string>();
  const followRows: { followerId: string; followingId: string; createdAt: Date }[] = [];

  for (const userId of userIds) {
    const count = powerLawRandom(5, 50);
    for (let i = 0; i < count; i++) {
      const targetId = pickRandom(userIds);
      if (targetId === userId) continue;
      const key = `${userId}:${targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      followRows.push({
        followerId: userId,
        followingId: targetId,
        createdAt: randomPastDate(180),
      });
    }
  }

  for (const batch of chunk(followRows, BATCH_SIZE)) {
    await db.insert(communityMemberFollows).values(batch).onConflictDoNothing();
  }

  console.info(`  ✓ ${followRows.length} follow relationships inserted`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — Groups (1,000) + Channels
// ─────────────────────────────────────────────────────────────────────────────

async function seedGroups(userIds: string[]): Promise<string[]> {
  console.info("Phase 3: Seeding groups + channels...");

  const groupRows = Array.from({ length: GROUP_COUNT }, () => {
    const visRoll = Math.random();
    return {
      id: randomUUID(),
      name: faker.company.name().slice(0, 95),
      description: faker.lorem.sentences(2),
      visibility: (visRoll < 0.6 ? "public" : visRoll < 0.9 ? "private" : "hidden") as
        | "public"
        | "private"
        | "hidden",
      joinType: (Math.random() < 0.7 ? "open" : "approval") as "open" | "approval",
      postingPermission: "all_members" as const,
      commentingPermission: "open" as const,
      memberLimit: Math.random() < 0.3 ? Math.floor(Math.random() * 500) + 50 : null,
      creatorId: pickRandom(userIds),
      memberCount: 0,
      createdAt: randomPastDate(300),
      updatedAt: new Date(),
    };
  });

  for (const batch of chunk(groupRows, BATCH_SIZE)) {
    await db.insert(communityGroups).values(batch).onConflictDoNothing();
  }

  const groupIds = groupRows.map((g) => g.id);

  // Channels: 1-3 per group
  const channelRows = groupIds.flatMap((groupId) => {
    const count = Math.floor(Math.random() * 3) + 1;
    return Array.from({ length: count }, (_, i) => ({
      id: randomUUID(),
      groupId,
      name: i === 0 ? "general" : faker.word.noun().slice(0, 90),
      isDefault: i === 0,
      createdBy: pickRandom(userIds),
      createdAt: randomPastDate(300),
    }));
  });

  for (const batch of chunk(channelRows, BATCH_SIZE)) {
    await db.insert(communityGroupChannels).values(batch).onConflictDoNothing();
  }

  // Group members: power-law distribution (median 15, max 500)
  const memberRows: {
    groupId: string;
    userId: string;
    role: "member" | "creator";
    status: "active";
    joinedAt: Date;
  }[] = [];
  const seenGM = new Set<string>();

  for (const groupId of groupIds) {
    const creatorId = groupRows.find((g) => g.id === groupId)!.creatorId;
    const key = `${groupId}:${creatorId}`;
    if (!seenGM.has(key)) {
      seenGM.add(key);
      memberRows.push({
        groupId,
        userId: creatorId,
        role: "creator",
        status: "active",
        joinedAt: randomPastDate(300),
      });
    }

    const memberCount = powerLawRandom(5, 200);
    for (let i = 0; i < memberCount; i++) {
      const userId = pickRandom(userIds);
      const mk = `${groupId}:${userId}`;
      if (seenGM.has(mk)) continue;
      seenGM.add(mk);
      memberRows.push({
        groupId,
        userId,
        role: "member",
        status: "active",
        joinedAt: randomPastDate(270),
      });
    }
  }

  for (const batch of chunk(memberRows, BATCH_SIZE)) {
    await db.insert(communityGroupMembers).values(batch).onConflictDoNothing();
  }

  // Update member_count to reflect actual inserted memberships
  await db.execute(sql`
    UPDATE community_groups SET member_count = (
      SELECT COUNT(*) FROM community_group_members
      WHERE community_group_members.group_id = community_groups.id
        AND community_group_members.status = 'active'
    )
  `);

  console.info(
    `  ✓ ${groupIds.length} groups, ${channelRows.length} channels, ${memberRows.length} memberships inserted`,
  );
  return groupIds;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 — Posts (100,000)
// ─────────────────────────────────────────────────────────────────────────────

async function seedPosts(userIds: string[], groupIds: string[]): Promise<void> {
  console.info("Phase 4: Seeding posts...");

  const FEED_COUNT = Math.floor(POST_COUNT * 0.8);
  const GROUP_POST_COUNT = POST_COUNT - FEED_COUNT;

  const feedPosts = Array.from({ length: FEED_COUNT }, () => ({
    id: randomUUID(),
    authorId: pickRandom(userIds),
    content: faker.lorem.paragraph(),
    contentType: "text" as const,
    visibility: "members_only" as const,
    category: faker.helpers.arrayElement(["discussion", "announcement"] as const),
    status: "active" as const,
    isPinned: false,
    likeCount: Math.floor(Math.random() * 20),
    commentCount: Math.floor(Math.random() * 10),
    shareCount: Math.floor(Math.random() * 5),
    createdAt: randomPastDate(180),
    updatedAt: new Date(),
  }));

  const groupPosts = Array.from({ length: GROUP_POST_COUNT }, () => ({
    id: randomUUID(),
    authorId: pickRandom(userIds),
    content: faker.lorem.paragraph(),
    contentType: "text" as const,
    visibility: "group" as const,
    category: "discussion" as const,
    groupId: pickRandom(groupIds),
    status: "active" as const,
    isPinned: false,
    likeCount: Math.floor(Math.random() * 10),
    commentCount: Math.floor(Math.random() * 5),
    shareCount: 0,
    createdAt: randomPastDate(180),
    updatedAt: new Date(),
  }));

  const allPosts = [...feedPosts, ...groupPosts];
  for (const batch of chunk(allPosts, BATCH_SIZE)) {
    await db.insert(communityPosts).values(batch).onConflictDoNothing();
  }

  console.info(`  ✓ ${allPosts.length} posts inserted`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — Conversations + Messages (500,000)
// ─────────────────────────────────────────────────────────────────────────────

async function seedMessages(userIds: string[]): Promise<void> {
  console.info("Phase 5: Seeding conversations + messages...");

  const DM_CONV_COUNT = 5_000;
  const GROUP_CONV_COUNT = 2_000;
  const DM_MSG_AVG = 50;
  const GROUP_MSG_AVG = 125;

  const conversationRows: {
    id: string;
    type: "direct" | "group";
    createdAt: Date;
    updatedAt: Date;
  }[] = [];
  const memberRows: { conversationId: string; userId: string; joinedAt: Date }[] = [];

  // DM conversations
  const seenDM = new Set<string>();
  let dmCreated = 0;
  const attempts = DM_CONV_COUNT * 3;
  for (let i = 0; i < attempts && dmCreated < DM_CONV_COUNT; i++) {
    const u1 = pickRandom(userIds);
    const u2 = pickRandom(userIds);
    if (u1 === u2) continue;
    const key = [u1, u2].sort().join(":");
    if (seenDM.has(key)) continue;
    seenDM.add(key);
    const convId = randomUUID();
    const createdAt = randomPastDate(180);
    conversationRows.push({ id: convId, type: "direct", createdAt, updatedAt: new Date() });
    memberRows.push({ conversationId: convId, userId: u1, joinedAt: createdAt });
    memberRows.push({ conversationId: convId, userId: u2, joinedAt: createdAt });
    dmCreated++;
  }

  // Group conversations
  for (let i = 0; i < GROUP_CONV_COUNT; i++) {
    const convId = randomUUID();
    const createdAt = randomPastDate(180);
    conversationRows.push({ id: convId, type: "group", createdAt, updatedAt: new Date() });
    const memberCount = powerLawRandom(3, 20);
    const seenMember = new Set<string>();
    for (let j = 0; j < memberCount; j++) {
      const userId = pickRandom(userIds);
      if (seenMember.has(userId)) continue;
      seenMember.add(userId);
      memberRows.push({ conversationId: convId, userId, joinedAt: createdAt });
    }
  }

  for (const batch of chunk(conversationRows, BATCH_SIZE)) {
    await db.insert(chatConversations).values(batch).onConflictDoNothing();
  }
  for (const batch of chunk(memberRows, BATCH_SIZE)) {
    await db.insert(chatConversationMembers).values(batch).onConflictDoNothing();
  }

  console.info(
    `  ✓ ${conversationRows.length} conversations inserted (${dmCreated} DM, ${GROUP_CONV_COUNT} group)`,
  );

  // Messages — batched to avoid memory issues
  let totalMessages = 0;
  const dmConvIds = conversationRows.filter((c) => c.type === "direct").map((c) => c.id);
  const grpConvIds = conversationRows.filter((c) => c.type === "group").map((c) => c.id);

  // Build conv→members index for realistic sender selection
  const convMembers: Map<string, string[]> = new Map();
  for (const m of memberRows) {
    if (!convMembers.has(m.conversationId)) convMembers.set(m.conversationId, []);
    convMembers.get(m.conversationId)!.push(m.userId);
  }

  const writeMessages = async (convIds: string[], avgMessages: number) => {
    let msgBuffer: {
      id: string;
      conversationId: string;
      senderId: string;
      content: string;
      contentType: "text";
      createdAt: Date;
    }[] = [];

    for (const convId of convIds) {
      const members = convMembers.get(convId) ?? userIds.slice(0, 2);
      const msgCount = Math.max(1, Math.floor(avgMessages * (0.5 + Math.random())));
      const startDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

      for (let k = 0; k < msgCount; k++) {
        const offset = (k / msgCount) * 180 * 24 * 60 * 60 * 1000;
        const jitter = Math.random() * 60 * 60 * 1000;
        msgBuffer.push({
          id: randomUUID(),
          conversationId: convId,
          senderId: pickRandom(members),
          content: faker.lorem.sentence(),
          contentType: "text",
          createdAt: new Date(startDate.getTime() + offset + jitter),
        });

        if (msgBuffer.length >= BATCH_SIZE) {
          await db.insert(chatMessages).values(msgBuffer).onConflictDoNothing();
          totalMessages += msgBuffer.length;
          msgBuffer = [];
        }
      }
    }

    if (msgBuffer.length > 0) {
      await db.insert(chatMessages).values(msgBuffer).onConflictDoNothing();
      totalMessages += msgBuffer.length;
    }
  };

  await writeMessages(dmConvIds, DM_MSG_AVG);
  await writeMessages(grpConvIds, GROUP_MSG_AVG);

  console.info(`  ✓ ~${totalMessages.toLocaleString()} messages inserted`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.info("🌱 Load test seeder starting...");
  console.info(`   Target: ${LOADTEST_DB_URL.replace(/:[^:@]+@/, ":***@")}`);

  if (await isAlreadySeeded()) {
    console.info("✅ Database already seeded (>5000 members found). Skipping.");
    await client.end();
    return;
  }

  const start = Date.now();

  const userIds = await seedMembers();
  await seedSocialGraph(userIds);
  const groupIds = await seedGroups(userIds);
  await seedPosts(userIds, groupIds);
  await seedMessages(userIds);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.info(`\n✅ Seeding complete in ${elapsed}s`);
  console.info(`   Members: ${MEMBER_COUNT.toLocaleString()}`);
  console.info(`   Groups: ${GROUP_COUNT.toLocaleString()}`);
  console.info(`   Posts: ${POST_COUNT.toLocaleString()}`);
  console.info(`   Messages: ~${TARGET_MESSAGE_COUNT.toLocaleString()} (target)`);

  await client.end();
}

main().catch((err) => {
  console.error("Seeder failed:", err);
  process.exit(1);
});
