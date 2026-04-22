// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Hoisted mock factories ──────────────────────────────────────────────────
const mockDb = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("../index", () => ({ db: mockDb }));
vi.mock("../schema/chat-conversations", () => ({
  chatConversations: {
    id: { name: "id" },
    type: { name: "type" },
    context: { name: "context" },
    applicationId: { name: "application_id" },
    portalContextJson: { name: "portal_context_json" },
    deletedAt: { name: "deleted_at" },
  },
  chatConversationMembers: {
    conversationId: { name: "conversation_id" },
    userId: { name: "user_id" },
    participantRole: { name: "participant_role" },
  },
}));

// Mock getUserConversations from chat-conversations
vi.mock("./chat-conversations", () => ({
  getUserConversations: vi.fn(),
}));

import {
  createPortalConversation,
  getPortalConversationByApplicationId,
  getPortalConversationsForUser,
  isPortalConversationReadOnly,
  getPortalConversationParticipantRole,
} from "./portal-conversations";
import { getUserConversations } from "./chat-conversations";

const APP_ID = "00000000-0000-4000-8000-000000000001";
const CONV_ID = "00000000-0000-4000-8000-000000000002";
const EMPLOYER_ID = "00000000-0000-4000-8000-000000000003";
const SEEKER_ID = "00000000-0000-4000-8000-000000000004";
const USER_ID = "00000000-0000-4000-8000-000000000005";

const portalContext = {
  jobId: "job-1",
  companyId: "company-1",
  jobTitle: "Software Engineer",
  companyName: "Tech Corp",
};

const mockConversation = {
  id: CONV_ID,
  type: "direct" as const,
  context: "portal" as const,
  applicationId: APP_ID,
  portalContextJson: portalContext,
  channelId: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  deletedAt: null,
};

function chainable(returnValue: unknown) {
  const resolved = Promise.resolve(returnValue);
  const chain: Record<string, unknown> = {
    then: resolved.then.bind(resolved),
    catch: resolved.catch.bind(resolved),
    finally: resolved.finally.bind(resolved),
  };
  ["from", "innerJoin", "where", "orderBy", "values", "set"].forEach((k) => {
    chain[k] = vi.fn().mockReturnValue(chain);
  });
  chain["limit"] = vi.fn().mockResolvedValue(returnValue);
  chain["returning"] = vi.fn().mockResolvedValue(returnValue);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── createPortalConversation ───────────────────────────────────────────────────

describe("createPortalConversation", () => {
  it("creates conversation with correct context, type, applicationId, portalContextJson", async () => {
    let capturedConversationInsertValues: unknown;
    let insertCallCount = 0;
    const txChain = {
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((v: unknown) => {
          insertCallCount++;
          if (insertCallCount === 1) {
            // First insert: conversation — capture the values
            capturedConversationInsertValues = v;
            return { returning: vi.fn().mockResolvedValue([mockConversation]) };
          }
          // Second insert: members — just resolve
          return Promise.resolve();
        }),
      })),
    };
    mockDb.transaction.mockImplementation(async (cb: any) => cb(txChain));

    const result = await createPortalConversation({
      applicationId: APP_ID,
      employerUserId: EMPLOYER_ID,
      seekerUserId: SEEKER_ID,
      portalContext,
    });

    expect(result).toEqual(mockConversation);
    expect(mockDb.transaction).toHaveBeenCalled();
    expect(capturedConversationInsertValues).toMatchObject({
      type: "direct",
      context: "portal",
      applicationId: APP_ID,
      portalContextJson: portalContext,
    });
  });

  it("inserts two members with correct participant roles (employer + seeker)", async () => {
    const memberInsertValues: unknown[] = [];
    let callCount = 0;
    const txChain = {
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((v: unknown) => {
          callCount++;
          if (callCount === 1) {
            // First insert: conversation
            return { returning: vi.fn().mockResolvedValue([mockConversation]) };
          }
          // Second insert: members
          memberInsertValues.push(v);
          return Promise.resolve();
        }),
      })),
    };
    mockDb.transaction.mockImplementation(async (cb: any) => cb(txChain));

    await createPortalConversation({
      applicationId: APP_ID,
      employerUserId: EMPLOYER_ID,
      seekerUserId: SEEKER_ID,
      portalContext,
    });

    expect(memberInsertValues).toHaveLength(1);
    const members = memberInsertValues[0] as Array<{
      userId: string;
      participantRole: string;
    }>;
    expect(members).toHaveLength(2);
    expect(members.find((m) => m.userId === EMPLOYER_ID)?.participantRole).toBe("employer");
    expect(members.find((m) => m.userId === SEEKER_ID)?.participantRole).toBe("seeker");
  });

  it("returns the created conversation", async () => {
    let callCount = 0;
    const txChain = {
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return { returning: vi.fn().mockResolvedValue([mockConversation]) };
          }
          return Promise.resolve();
        }),
      })),
    };
    mockDb.transaction.mockImplementation(async (cb: any) => cb(txChain));

    const result = await createPortalConversation({
      applicationId: APP_ID,
      employerUserId: EMPLOYER_ID,
      seekerUserId: SEEKER_ID,
      portalContext,
    });

    expect(result.id).toBe(CONV_ID);
    expect(result.context).toBe("portal");
    expect(result.applicationId).toBe(APP_ID);
  });

  it("throws unique constraint violation for duplicate applicationId (DB enforced)", async () => {
    const dbError = new Error(
      'duplicate key value violates unique constraint "unq_chat_conversations_application_id"',
    );
    const txChain = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(dbError),
        }),
      }),
    };
    mockDb.transaction.mockImplementation(async (cb: any) => cb(txChain));

    await expect(
      createPortalConversation({
        applicationId: APP_ID,
        employerUserId: EMPLOYER_ID,
        seekerUserId: SEEKER_ID,
        portalContext,
      }),
    ).rejects.toThrow(/duplicate key/);
  });
});

// ── getPortalConversationByApplicationId ──────────────────────────────────────

describe("getPortalConversationByApplicationId", () => {
  it("returns conversation with members when found", async () => {
    const convChain = chainable([mockConversation]);
    const memberChain = chainable([
      { userId: EMPLOYER_ID, participantRole: "employer" },
      { userId: SEEKER_ID, participantRole: "seeker" },
    ]);

    mockDb.select
      .mockReturnValueOnce(convChain) // first call: conversation lookup
      .mockReturnValueOnce(memberChain); // second call: members lookup

    const result = await getPortalConversationByApplicationId(APP_ID);

    expect(result).not.toBeNull();
    expect(result!.conversation.id).toBe(CONV_ID);
    expect(result!.members).toHaveLength(2);
    expect(result!.members.find((m) => m.userId === EMPLOYER_ID)?.participantRole).toBe("employer");
    expect(result!.members.find((m) => m.userId === SEEKER_ID)?.participantRole).toBe("seeker");
  });

  it("returns null when conversation not found", async () => {
    const emptyChain = chainable([]);
    mockDb.select.mockReturnValueOnce(emptyChain);

    const result = await getPortalConversationByApplicationId(APP_ID);
    expect(result).toBeNull();
  });
});

// ── getPortalConversationsForUser ─────────────────────────────────────────────

describe("getPortalConversationsForUser", () => {
  it("delegates to getUserConversations with context='portal'", async () => {
    const expectedResult = { conversations: [], hasMore: false };
    vi.mocked(getUserConversations).mockResolvedValue(expectedResult);

    const result = await getPortalConversationsForUser(USER_ID, { limit: 10 });

    expect(getUserConversations).toHaveBeenCalledWith(USER_ID, {
      limit: 10,
      context: "portal",
    });
    expect(result).toEqual(expectedResult);
  });

  it("passes cursor option to getUserConversations", async () => {
    vi.mocked(getUserConversations).mockResolvedValue({ conversations: [], hasMore: false });
    const cursor = "2026-01-01T00:00:00.000Z";

    await getPortalConversationsForUser(USER_ID, { cursor });

    expect(getUserConversations).toHaveBeenCalledWith(USER_ID, {
      cursor,
      context: "portal",
    });
  });
});

// ── isPortalConversationReadOnly ──────────────────────────────────────────────

describe("isPortalConversationReadOnly", () => {
  it("returns true for 'hired' status", async () => {
    mockDb.execute.mockResolvedValue([{ status: "hired" }]);
    expect(await isPortalConversationReadOnly(APP_ID)).toBe(true);
  });

  it("returns true for 'rejected' status", async () => {
    mockDb.execute.mockResolvedValue([{ status: "rejected" }]);
    expect(await isPortalConversationReadOnly(APP_ID)).toBe(true);
  });

  it("returns true for 'withdrawn' status", async () => {
    mockDb.execute.mockResolvedValue([{ status: "withdrawn" }]);
    expect(await isPortalConversationReadOnly(APP_ID)).toBe(true);
  });

  it("returns false for 'submitted' status", async () => {
    mockDb.execute.mockResolvedValue([{ status: "submitted" }]);
    expect(await isPortalConversationReadOnly(APP_ID)).toBe(false);
  });

  it("returns false for 'shortlisted' status", async () => {
    mockDb.execute.mockResolvedValue([{ status: "shortlisted" }]);
    expect(await isPortalConversationReadOnly(APP_ID)).toBe(false);
  });

  it("returns true when application not found (fail-closed / defensive)", async () => {
    mockDb.execute.mockResolvedValue([]);
    expect(await isPortalConversationReadOnly(APP_ID)).toBe(true);
  });

  it("drift-guard: local TERMINAL_STATES matches APPLICATION_TERMINAL_STATES", async () => {
    // Import the canonical source IN THE TEST ONLY (safe — tests run in Node/Vitest, not realtime server)
    const { APPLICATION_TERMINAL_STATES } = await import("../schema/portal-applications");

    // Import the TERMINAL_STATES from the module under test via a roundabout approach:
    // We test behaviour for each known terminal state to ensure coverage is complete.
    // Additionally, verify that all APPLICATION_TERMINAL_STATES make readOnly=true.
    for (const terminalStatus of APPLICATION_TERMINAL_STATES) {
      mockDb.execute.mockResolvedValue([{ status: terminalStatus }]);
      const isReadOnly = await isPortalConversationReadOnly(APP_ID);
      expect(isReadOnly).toBe(true);
    }

    // And non-terminal states make readOnly=false
    const nonTerminal = ["submitted", "under_review", "shortlisted", "interview", "offered"];
    for (const status of nonTerminal) {
      mockDb.execute.mockResolvedValue([{ status }]);
      const isReadOnly = await isPortalConversationReadOnly(APP_ID);
      expect(isReadOnly).toBe(false);
    }
  });
});

// ── getPortalConversationParticipantRole ──────────────────────────────────────

describe("getPortalConversationParticipantRole", () => {
  it("returns role when user is a member", async () => {
    const chain = chainable([{ participantRole: "employer" }]);
    mockDb.select.mockReturnValue(chain);

    const result = await getPortalConversationParticipantRole(CONV_ID, EMPLOYER_ID);
    expect(result).toBe("employer");
  });

  it("returns null when user is not a member", async () => {
    const chain = chainable([]);
    mockDb.select.mockReturnValue(chain);

    const result = await getPortalConversationParticipantRole(CONV_ID, USER_ID);
    expect(result).toBeNull();
  });
});
