/**
 * PREP-H: Cross-App Schema Change Validation — Community Chat Survives Portal Extension
 *
 * Integration tests covering:
 * - DB: migration safety, query isolation, write-path correctness, immutability
 * - EventBus: event naming isolation (chat.* vs portal.*)
 * - Socket.IO: namespace isolation (/chat vs /portal)
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

vi.mock("server-only", () => ({}));

// ═══════════════════════════════════════════════════════════════════════════════
// EventBus Isolation Tests (Tasks 9) — No DB or external infra needed
// ═══════════════════════════════════════════════════════════════════════════════

class TestEventBus {
  private handlers = new Map<string, Set<Function>>();
  on(event: string, handler: Function) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
  }
  emit(event: string, payload: unknown) {
    this.handlers.get(event)?.forEach((h) => h(payload));
  }
}

describe("EventBus: event naming isolation", () => {
  let bus: TestEventBus;
  let communityHandler: ReturnType<typeof vi.fn>;
  let portalHandler: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    bus = new TestEventBus();
    communityHandler = vi.fn();
    portalHandler = vi.fn();
    bus.on("chat.message.sent", communityHandler);
    bus.on("portal.message.sent", portalHandler);
  });

  it("Test 9: chat.message.sent fires community handler, portal handler silent", async () => {
    bus.emit("chat.message.sent", { conversationId: "c1", content: "hello" });
    expect(communityHandler).toHaveBeenCalledTimes(1);
    expect(communityHandler).toHaveBeenCalledWith({ conversationId: "c1", content: "hello" });
    // Short wait to confirm no delayed invocation
    await new Promise((r) => setTimeout(r, 50));
    expect(portalHandler).not.toHaveBeenCalled();
  });

  it("Test 10: portal.message.sent fires portal handler, community handler silent", async () => {
    communityHandler.mockClear();
    portalHandler.mockClear();
    bus.emit("portal.message.sent", { conversationId: "p1", content: "portal msg" });
    expect(portalHandler).toHaveBeenCalledTimes(1);
    expect(portalHandler).toHaveBeenCalledWith({ conversationId: "p1", content: "portal msg" });
    await new Promise((r) => setTimeout(r, 50));
    expect(communityHandler).not.toHaveBeenCalled();
  });

  it("Test 11: old message.sent fires NEITHER handler (fail-closed)", async () => {
    communityHandler.mockClear();
    portalHandler.mockClear();
    bus.emit("message.sent", { conversationId: "x1", content: "old event" });
    await new Promise((r) => setTimeout(r, 50));
    expect(communityHandler).not.toHaveBeenCalled();
    expect(portalHandler).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Socket.IO Namespace Isolation Tests (Task 10) — No DB needed
// ═══════════════════════════════════════════════════════════════════════════════

describe("Socket.IO: namespace isolation", () => {
  let server: http.Server;
  let io: InstanceType<typeof import("socket.io").Server>;
  let port: number;

  beforeAll(async () => {
    const { Server } = await import("socket.io");
    server = http.createServer();
    io = new Server(server, { cors: { origin: "*" } });

    // Set up /chat and /portal namespaces
    io.of("/chat");
    io.of("/portal");

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        port = typeof addr === "object" && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterAll(async () => {
    io?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("Test 12: same room name, different namespace — no event leak", async () => {
    const { io: ioClient } = await import("socket.io-client");

    const clientChat = ioClient(`http://localhost:${port}/chat`, { forceNew: true });
    const clientPortal = ioClient(`http://localhost:${port}/portal`, { forceNew: true });

    // Wait for both to connect
    await Promise.all([
      new Promise<void>((r) => clientChat.on("connect", r)),
      new Promise<void>((r) => clientPortal.on("connect", r)),
    ]);

    // Server-side: join both to same room name
    const chatSockets = await io.of("/chat").fetchSockets();
    const portalSockets = await io.of("/portal").fetchSockets();
    chatSockets[0]?.join("conversation:abc");
    portalSockets[0]?.join("conversation:abc");

    const chatReceived: unknown[] = [];
    const portalReceived: unknown[] = [];
    clientChat.on("message:new", (data: unknown) => chatReceived.push(data));
    clientPortal.on("message:new", (data: unknown) => portalReceived.push(data));

    // Emit to /chat room
    io.of("/chat").to("conversation:abc").emit("message:new", { from: "chat" });
    await new Promise((r) => setTimeout(r, 100));

    expect(chatReceived).toHaveLength(1);
    expect(chatReceived[0]).toEqual({ from: "chat" });
    expect(portalReceived).toHaveLength(0);

    // Emit to /portal room
    io.of("/portal").to("conversation:abc").emit("message:new", { from: "portal" });
    await new Promise((r) => setTimeout(r, 100));

    expect(portalReceived).toHaveLength(1);
    expect(portalReceived[0]).toEqual({ from: "portal" });
    expect(chatReceived).toHaveLength(1); // still 1, no leak from portal

    clientChat.disconnect();
    clientPortal.disconnect();
  });

  it("Test 13: room membership IS delivery gate (positive + negative)", async () => {
    const { io: ioClient } = await import("socket.io-client");

    // Part A: joined client receives
    const joinedClient = ioClient(`http://localhost:${port}/chat`, { forceNew: true });
    await new Promise<void>((r) => joinedClient.on("connect", r));

    const joinedSockets = await io.of("/chat").fetchSockets();
    const joinedSocket = joinedSockets.find((s) => s.id === joinedClient.id);
    joinedSocket?.join("conversation:test-room");

    const joinedReceived: unknown[] = [];
    joinedClient.on("message:new", (data: unknown) => joinedReceived.push(data));

    io.of("/chat").to("conversation:test-room").emit("message:new", { msg: "hello" });
    await new Promise((r) => setTimeout(r, 100));
    expect(joinedReceived).toHaveLength(1);
    expect(joinedReceived[0]).toEqual({ msg: "hello" });

    // Part B: unjoined client receives nothing
    const unjoinedClient = ioClient(`http://localhost:${port}/chat`, { forceNew: true });
    await new Promise<void>((r) => unjoinedClient.on("connect", r));

    const unjoinedReceived: unknown[] = [];
    unjoinedClient.on("message:new", (data: unknown) => unjoinedReceived.push(data));

    io.of("/chat").to("conversation:test-room").emit("message:new", { msg: "second" });
    await new Promise((r) => setTimeout(r, 100));

    expect(joinedReceived).toHaveLength(2); // received both
    expect(unjoinedReceived).toHaveLength(0); // received nothing

    joinedClient.disconnect();
    unjoinedClient.disconnect();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DB Integration Tests (Task 8) — Requires DATABASE_URL
// ═══════════════════════════════════════════════════════════════════════════════

const DATABASE_URL = process.env.DATABASE_URL;

// CI silent-skip guardrail: fails in CI if DATABASE_URL is missing
it.skipIf(!process.env.CI)("CI must provide DATABASE_URL for DB integration tests", () => {
  expect(process.env.DATABASE_URL).toBeDefined();
});

describe.skipIf(!DATABASE_URL)("DB: migration + query isolation", () => {
  let pgClient: ReturnType<typeof import("postgres").default>;

  // Seed data IDs
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  const portalUser = crypto.randomUUID();
  const employerUser = crypto.randomUUID();
  const seekerUser = crypto.randomUUID();
  let directConvId: string;
  let groupConvId: string;
  let channelConvId: string;
  let portalConvId: string;
  let applicationId: string;
  let companyId: string;
  let seekerProfileId: string;
  let jobPostingId: string;

  /**
   * Apply migrations from journal up to a given index (inclusive).
   */
  async function applyMigrations(
    client: ReturnType<typeof import("postgres").default>,
    upToIndex: number,
  ) {
    const journalPath = path.resolve(
      __dirname,
      "../db/src/migrations/meta/_journal.json",
    );
    const journal = JSON.parse(fs.readFileSync(journalPath, "utf-8"));
    const entries = journal.entries.filter(
      (e: { idx: number }) => e.idx <= upToIndex,
    );

    for (const entry of entries) {
      const sqlPath = path.resolve(
        __dirname,
        `../db/src/migrations/${entry.tag}.sql`,
      );
      const sqlContent = fs.readFileSync(sqlPath, "utf-8");
      // Split on breakpoint markers and execute each statement
      const statements = sqlContent
        .split("--> statement-breakpoint")
        .map((s: string) => s.trim())
        .filter(Boolean);
      for (const stmt of statements) {
        await client.unsafe(stmt);
      }
    }
  }

  beforeAll(async () => {
    const postgres = (await import("postgres")).default;
    pgClient = postgres(DATABASE_URL!, { max: 1 });

    // Clean slate
    await pgClient.unsafe("DROP SCHEMA public CASCADE");
    await pgClient.unsafe("CREATE SCHEMA public");

    // Apply base migrations (0000-0072, NOT 0073)
    await applyMigrations(pgClient, 72);

    // Smoke check: chat_conversations table exists
    const tableCheck = await pgClient`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'chat_conversations'
      ) as exists
    `;
    expect(tableCheck[0]?.exists).toBe(true);

    // Seed users
    for (const uid of [userA, userB, portalUser, employerUser, seekerUser]) {
      await pgClient`
        INSERT INTO auth_users (id, email, name, account_status, role, consent_privacy, consent_terms)
        VALUES (${uid}, ${uid + "@test.com"}, ${"User " + uid.slice(0, 4)}, 'active', 'user', true, true)
      `;
    }

    // Seed 3 community conversations (direct, group, channel)
    // Direct
    const [directConv] = await pgClient`
      INSERT INTO chat_conversations (type) VALUES ('direct') RETURNING id
    `;
    directConvId = directConv!.id;
    await pgClient`INSERT INTO chat_conversation_members (conversation_id, user_id) VALUES (${directConvId}, ${userA}), (${directConvId}, ${userB})`;
    await pgClient`INSERT INTO chat_messages (conversation_id, sender_id, content) VALUES (${directConvId}, ${userA}, 'Hello B')`;

    // Group
    const [groupConv] = await pgClient`
      INSERT INTO chat_conversations (type) VALUES ('group') RETURNING id
    `;
    groupConvId = groupConv!.id;
    await pgClient`INSERT INTO chat_conversation_members (conversation_id, user_id) VALUES (${groupConvId}, ${userA}), (${groupConvId}, ${userB})`;

    // Channel — needs a group and channel first
    const [group] = await pgClient`
      INSERT INTO community_groups (name, creator_id) VALUES ('Test Group', ${userA}) RETURNING id
    `;
    const [channel] = await pgClient`
      INSERT INTO community_group_channels (group_id, name, created_by, is_default) VALUES (${group!.id}, 'general', ${userA}, true) RETURNING id
    `;
    const [channelConv] = await pgClient`
      INSERT INTO chat_conversations (type, channel_id) VALUES ('channel', ${channel!.id}) RETURNING id
    `;
    channelConvId = channelConv!.id;
    await pgClient`INSERT INTO chat_conversation_members (conversation_id, user_id) VALUES (${channelConvId}, ${userA})`;

    // Now apply migration 0073
    const migration0073Path = path.resolve(
      __dirname,
      "../db/src/migrations/0073_chat_context_column.sql",
    );
    const migration0073Sql = fs.readFileSync(migration0073Path, "utf-8");
    const statements = migration0073Sql
      .split("--> statement-breakpoint")
      .map((s: string) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await pgClient.unsafe(stmt);
    }

    // Seed portal FK chain: company → seeker profile → job posting → application
    companyId = crypto.randomUUID();
    seekerProfileId = crypto.randomUUID();
    jobPostingId = crypto.randomUUID();
    applicationId = crypto.randomUUID();

    await pgClient`
      INSERT INTO portal_company_profiles (id, user_id, company_name, industry, company_size, description)
      VALUES (${companyId}, ${employerUser}, 'Test Corp', 'Technology', 'small', 'A test company')
    `;
    await pgClient`
      INSERT INTO portal_seeker_profiles (id, user_id, full_name, headline)
      VALUES (${seekerProfileId}, ${seekerUser}, 'Test Seeker', 'Developer')
    `;
    await pgClient`
      INSERT INTO portal_job_postings (id, company_id, title, description, employment_type, location_type, status, posted_by_user_id)
      VALUES (${jobPostingId}, ${companyId}, 'Engineer', 'Build stuff', 'full_time', 'remote', 'active', ${employerUser})
    `;
    await pgClient`
      INSERT INTO portal_applications (id, job_posting_id, user_id, status)
      VALUES (${applicationId}, ${jobPostingId}, ${seekerUser}, 'submitted')
    `;
  }, 60000);

  afterAll(async () => {
    if (pgClient) {
      // Clean up
      await pgClient.unsafe("DROP SCHEMA public CASCADE");
      await pgClient.unsafe("CREATE SCHEMA public");
      await pgClient.end();
    }
  });

  describe("migration safety", () => {
    it("Test 1: pre-migration rows survive with context='community'", async () => {
      const rows = await pgClient`
        SELECT id, context::text FROM chat_conversations WHERE id = ANY(${[directConvId, groupConvId, channelConvId]})
      `;
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row.context).toBe("community");
      }
    });

    it("Test 2: context column NOT NULL DEFAULT applied to all seeded rows", async () => {
      const [result] = await pgClient`
        SELECT COUNT(*)::int as count FROM chat_conversations WHERE context IS NULL
      `;
      expect(result!.count).toBe(0);
    });
  });

  describe("write-path correctness", () => {
    it("Test 5/14: portal conversation with context='portal' + applicationId succeeds and is queryable", async () => {
      const [conv] = await pgClient`
        INSERT INTO chat_conversations (type, context, application_id)
        VALUES ('direct', 'portal', ${applicationId})
        RETURNING id, context::text
      `;
      portalConvId = conv!.id;
      expect(conv!.context).toBe("portal");

      // Add members
      await pgClient`INSERT INTO chat_conversation_members (conversation_id, user_id) VALUES (${portalConvId}, ${employerUser}), (${portalConvId}, ${seekerUser})`;

      // Queryable with context='portal'
      const [portalResult] = await pgClient`
        SELECT id FROM chat_conversations WHERE id = ${portalConvId} AND context = 'portal'
      `;
      expect(portalResult).toBeDefined();

      // Excluded from context='community'
      const communityResult = await pgClient`
        SELECT id FROM chat_conversations WHERE id = ${portalConvId} AND context = 'community'
      `;
      expect(communityResult).toHaveLength(0);
    });

    it("Test 6: INSERT context='portal' with channelId → CHECK fails", async () => {
      // Get the channelId from our channel conversation
      const [conv] = await pgClient`SELECT channel_id FROM chat_conversations WHERE id = ${channelConvId}`;
      const channelId = conv!.channel_id;

      await expect(
        pgClient`
          INSERT INTO chat_conversations (type, context, channel_id, application_id)
          VALUES ('channel', 'portal', ${channelId}, ${applicationId})
        `,
      ).rejects.toThrow(/chk_portal_no_channel/);
    });

    it("Test 7: INSERT context='community' with applicationId → CHECK fails", async () => {
      await expect(
        pgClient`
          INSERT INTO chat_conversations (type, context, application_id)
          VALUES ('direct', 'community', ${applicationId})
        `,
      ).rejects.toThrow(/chk_community_no_application/);
    });

    it("Test 7b: INSERT context='portal' WITHOUT applicationId → CHECK fails", async () => {
      await expect(
        pgClient`
          INSERT INTO chat_conversations (type, context)
          VALUES ('direct', 'portal')
        `,
      ).rejects.toThrow(/chk_portal_requires_application/);
    });
  });

  describe("immutability", () => {
    it("Test 8: UPDATE context from 'community' to 'portal' → trigger rejects", async () => {
      await expect(
        pgClient`
          UPDATE chat_conversations SET context = 'portal' WHERE id = ${directConvId}
        `,
      ).rejects.toThrow(/conversation context is immutable/);
    });
  });

  describe("query isolation", () => {
    it("Test 3: community queries filter by context, exclude portal", async () => {
      // Get community conversation IDs for userA
      const communityConvs = await pgClient`
        SELECT c.id FROM chat_conversations c
        INNER JOIN chat_conversation_members ccm ON ccm.conversation_id = c.id
        WHERE ccm.user_id = ${userA} AND c.context = 'community' AND c.deleted_at IS NULL
      `;
      const ids = communityConvs.map((r: { id: string }) => r.id);
      expect(ids).toContain(directConvId);
      expect(ids).toContain(groupConvId);
      expect(ids).toContain(channelConvId);
      // Portal conversation should NOT appear
      expect(ids).not.toContain(portalConvId);
    });

    it("Test 4: portal queries filter by context, exclude community", async () => {
      const portalConvs = await pgClient`
        SELECT c.id FROM chat_conversations c
        INNER JOIN chat_conversation_members ccm ON ccm.conversation_id = c.id
        WHERE ccm.user_id = ${employerUser} AND c.context = 'portal' AND c.deleted_at IS NULL
      `;
      const ids = portalConvs.map((r: { id: string }) => r.id);
      expect(ids).toContain(portalConvId);
      expect(ids).not.toContain(directConvId);
      expect(ids).not.toContain(groupConvId);
      expect(ids).not.toContain(channelConvId);
    });

    it("Test 15: isConversationMember with portal convId + context='community' returns false", async () => {
      // Employer is a member of the portal conversation
      const [memberCheck] = await pgClient`
        SELECT ccm.conversation_id FROM chat_conversation_members ccm
        INNER JOIN chat_conversations c ON c.id = ccm.conversation_id AND c.context = 'community'
        WHERE ccm.conversation_id = ${portalConvId} AND ccm.user_id = ${employerUser}
        LIMIT 1
      `;
      expect(memberCheck).toBeUndefined(); // Should NOT find membership in community context
    });
  });
});
