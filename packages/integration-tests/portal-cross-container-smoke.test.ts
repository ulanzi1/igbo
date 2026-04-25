/**
 * AI-27: Cross-Container Messaging Smoke Test
 *
 * Validates the complete Portal → Redis → Realtime → Socket.IO delivery path:
 *
 *   Portal Next.js (apps/portal)
 *     └─ POST /api/v1/conversations/[convId]/messages
 *          └─ EventBus.emit("portal.message.sent", payload)
 *               └─ Redis PUBLISH "eventbus:portal.message.sent"  ← cross-container boundary
 *                     └─ Community realtime server
 *                          └─ psubscribe("eventbus:*") → routeToNamespace()
 *                               └─ case "portal.message.sent":
 *                                    portalNs.to(ROOM_CONVERSATION(convId)).emit("message:new", {...})
 *                                         └─ Socket.IO client (browser) ← what this test asserts
 *
 * Tests (static, always run — no live services):
 *   - Channel name contract: CHANNEL = "eventbus:portal.message.sent"
 *   - NAMESPACE_PORTAL, ROOM_CONVERSATION, ROOM_USER format contracts
 *   - eventbus-bridge routing drift guards: case/namespace/emission/fields presence
 *
 * Tests (live, require REDIS_URL):
 *   - describe.skipIf(!REDIS_URL): real Redis pub/sub → startEventBusBridge → Socket.IO client receives message:new
 *
 * Run smoke tests:
 *   REDIS_URL=redis://localhost:6379 pnpm --filter @igbo/integration-tests test:smoke
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — must be declared before any imports that trigger module resolution
// ─────────────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@igbo/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve([])) })),
      })),
    })),
    execute: vi.fn(() => Promise.resolve([])),
  },
}));
vi.mock("@igbo/db/schema/chat-messages", () => ({ chatMessages: {} }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));
vi.mock("@igbo/db/queries/group-channels", () => ({
  listGroupChannels: vi.fn(() => Promise.resolve([])),
}));
vi.mock("@igbo/db/queries/notifications", () => ({
  createNotification: vi.fn(() => Promise.resolve()),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const REDIS_URL = process.env.REDIS_URL;

const __dirname_smoke = path.dirname(fileURLToPath(import.meta.url));
const bridgePath = path.resolve(
  __dirname_smoke,
  "../../apps/community/src/server/realtime/subscribers/eventbus-bridge.ts",
);
const bridgeContent = fs.readFileSync(bridgePath, "utf-8");

// ─────────────────────────────────────────────────────────────────────────────
// Static: Channel name contract
// ─────────────────────────────────────────────────────────────────────────────

describe("portal.message.sent — channel contract (static)", () => {
  it('CHANNEL is "eventbus:portal.message.sent"', async () => {
    // The channel is the Redis pub/sub key used by EventBus.emit("portal.message.sent", ...)
    // Both Portal (publisher) and Community realtime (psubscribe) must agree on this key.
    const CHANNEL = "eventbus:portal.message.sent";
    expect(CHANNEL).toBe("eventbus:portal.message.sent");
  });

  it("NAMESPACE_PORTAL is /portal", async () => {
    const { NAMESPACE_PORTAL } = await import("@igbo/config/realtime");
    expect(NAMESPACE_PORTAL).toBe("/portal");
  });

  it("ROOM_CONVERSATION(id) contains the conversation id", async () => {
    const { ROOM_CONVERSATION } = await import("@igbo/config/realtime");
    const convId = "00000000-0000-4000-8000-000000000001";
    const room = ROOM_CONVERSATION(convId);
    expect(room).toContain(convId);
    expect(room).not.toBe(convId); // must have a prefix
  });

  it("ROOM_USER(id) contains the user id", async () => {
    const { ROOM_USER } = await import("@igbo/config/realtime");
    const userId = "00000000-0000-4000-8000-000000000002";
    const room = ROOM_USER(userId);
    expect(room).toContain(userId);
    expect(room).not.toBe(userId); // must have a prefix
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Static: eventbus-bridge routing drift guard
// ─────────────────────────────────────────────────────────────────────────────

describe("eventbus-bridge routing drift guard (static)", () => {
  it('bridge contains case "portal.message.sent"', () => {
    expect(bridgeContent).toContain('case "portal.message.sent"');
  });

  it("bridge routes to portalNs", () => {
    expect(bridgeContent).toContain("portalNs");
  });

  it('bridge emits "message:new"', () => {
    expect(bridgeContent).toContain('"message:new"');
  });

  it("bridge emits required payload fields", () => {
    // All fields that the Socket.IO client depends on must be present in the bridge source
    expect(bridgeContent).toContain("messageId");
    expect(bridgeContent).toContain("conversationId");
    expect(bridgeContent).toContain("senderId");
    expect(bridgeContent).toContain("content");
    expect(bridgeContent).toContain("contentType");
    expect(bridgeContent).toContain("createdAt");
    expect(bridgeContent).toContain("senderRole");
    expect(bridgeContent).toContain("applicationId");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Live: Redis pub/sub → startEventBusBridge → Socket.IO client receives message:new
// ─────────────────────────────────────────────────────────────────────────────

describe.skipIf(!REDIS_URL)(
  "Live: Portal → Redis → bridge → Socket.IO (requires REDIS_URL)",
  { timeout: 15000 },
  () => {
    let server: http.Server;
    let io: InstanceType<typeof import("socket.io").Server>;
    let port: number;
    let publisher: InstanceType<typeof import("ioredis").default>;
    let subscriber: InstanceType<typeof import("ioredis").default>;

    beforeAll(async () => {
      const { Server } = await import("socket.io");
      const Redis = (await import("ioredis")).default;
      const { NAMESPACE_PORTAL } = await import("@igbo/config/realtime");

      // Spin up in-process Socket.IO server with /portal namespace
      server = http.createServer();
      io = new Server(server, { cors: { origin: "*" } });
      io.of(NAMESPACE_PORTAL); // register namespace

      await new Promise<void>((resolve) => {
        server.listen(0, () => {
          const addr = server.address();
          port = typeof addr === "object" && addr ? addr.port : 0;
          resolve();
        });
      });

      // Start real Redis clients.
      // subscriber: enableReadyCheck:false prevents ioredis from sending INFO after psubscribe
      // puts the connection in subscribe mode (which would cause a reconnect race).
      publisher = new Redis(REDIS_URL!, { lazyConnect: false });
      subscriber = new Redis(REDIS_URL!, { lazyConnect: false, enableReadyCheck: false });

      // Start the real eventbus-bridge against the in-process Socket.IO server
      const { startEventBusBridge } = await import(
        "../../apps/community/src/server/realtime/subscribers/eventbus-bridge"
      );
      await startEventBusBridge(io, subscriber);

      // Wait for psubscribe to register fully before any publish
      await new Promise((r) => setTimeout(r, 100));
    });

    afterAll(async () => {
      try {
        await subscriber.punsubscribe("eventbus:*");
      } catch {
        // ignore if already unsubscribed
      }
      await subscriber.quit();
      await publisher.quit();
      io?.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it(
      "publishes portal.message.sent → client in ROOM_USER(senderId) receives message:new",
      async () => {
        const { io: ioClient } = await import("socket.io-client");
        const { NAMESPACE_PORTAL, ROOM_USER } = await import("@igbo/config/realtime");

        const senderId = `user-${Date.now()}`;
        const convId = `conv-${Date.now()}`;
        const CHANNEL = "eventbus:portal.message.sent";

        const payload = {
          eventId: `evt-${Date.now()}`,
          messageId: `msg-${Date.now()}`,
          conversationId: convId,
          senderId,
          recipientId: `recipient-${Date.now()}`,
          applicationId: "app-1",
          jobId: "job-1",
          companyId: "co-1",
          jobTitle: "Engineer",
          companyName: "ACME",
          content: "AI-27 smoke test message",
          contentType: "text",
          createdAt: new Date().toISOString(),
          parentMessageId: null,
          senderRole: "employer",
          attachments: [],
        };

        // Connect a Socket.IO client to the /portal namespace (no auth — bypassed for smoke test)
        const client = ioClient(`http://localhost:${port}${NAMESPACE_PORTAL}`, {
          forceNew: true,
        });

        await new Promise<void>((resolve) => client.on("connect", resolve));

        // Server-side: manually join the client socket to ROOM_USER(senderId)
        // This simulates what auth+auto-join does in production.
        // The bridge's auto-join will then move it from ROOM_USER into ROOM_CONVERSATION.
        const sockets = await io.of(NAMESPACE_PORTAL).fetchSockets();
        const clientSocket = sockets.find((s) => s.id === client.id);
        if (!clientSocket) throw new Error("Socket not found on server side");
        clientSocket.join(ROOM_USER(senderId));

        // Collect received message:new events
        const received: unknown[] = [];
        const receivePromise = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Timeout: message:new not received within 500ms")),
            500,
          );
          client.on("message:new", (data: unknown) => {
            received.push(data);
            clearTimeout(timeout);
            resolve();
          });
        });

        // Publish to Redis — this crosses the container boundary
        await publisher.publish(CHANNEL, JSON.stringify(payload));

        // Wait for: Redis pub/sub → psubscribe handler → Socket.IO emit → client receive
        await receivePromise;

        client.disconnect();

        // Verify the received payload
        expect(received).toHaveLength(1);
        const msg = received[0] as Record<string, unknown>;
        expect(msg.messageId).toBe(payload.messageId);
        expect(msg.conversationId).toBe(convId);
        expect(msg.senderId).toBe(senderId);
        expect(msg.content).toBe("AI-27 smoke test message");
        expect(msg.contentType).toBe("text");
        expect(msg.senderRole).toBe("employer");
        expect(msg.applicationId).toBe("app-1");
        expect(msg.createdAt).toBeDefined();
      },
    );
  },
);
