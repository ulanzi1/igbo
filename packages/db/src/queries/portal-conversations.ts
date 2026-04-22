// NOTE: No "server-only" — used by both Next.js and the standalone realtime server.
// DO NOT import portal-applications.ts (it imports "server-only" which crashes the realtime server).
import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "../index";
import { chatConversations, chatConversationMembers } from "../schema/chat-conversations";
import type {
  ChatConversation,
  PortalConversationContext,
  ParticipantRole,
} from "../schema/chat-conversations";
import { getUserConversations } from "./chat-conversations";
import type { EnrichedUserConversation } from "./chat-conversations";

export type { ParticipantRole, PortalConversationContext };

export type PortalConversationMember = {
  userId: string;
  participantRole: ParticipantRole;
};

export type PortalConversationWithMembers = {
  conversation: ChatConversation;
  members: PortalConversationMember[];
};

// Local constant mirroring APPLICATION_TERMINAL_STATES from portal-applications.ts.
// CRITICAL: do NOT import portal-applications.ts — it has `server-only` which crashes
// the standalone realtime server. This must stay in sync with the canonical source.
// Drift-guard test in portal-conversations.test.ts (test #15) will catch any divergence.
// Canonical source: packages/db/src/schema/portal-applications.ts → APPLICATION_TERMINAL_STATES
const TERMINAL_STATES = ["hired", "rejected", "withdrawn"] as const;

/**
 * Create a portal conversation atomically with two participants.
 * Enforces:
 *   - context = 'portal', type = 'direct'
 *   - applicationId is set
 *   - portalContextJson is populated
 *   - exactly two members with roles 'employer' and 'seeker'
 *
 * Note: unique partial index on application_id WHERE context='portal' AND deleted_at IS NULL
 * enforces one active conversation per application at the DB level. If called twice for the
 * same application, the insert throws a unique constraint violation.
 */
export async function createPortalConversation(params: {
  applicationId: string;
  employerUserId: string;
  seekerUserId: string;
  portalContext: PortalConversationContext;
}): Promise<ChatConversation> {
  const { applicationId, employerUserId, seekerUserId, portalContext } = params;

  return db.transaction(async (tx) => {
    const [conversation] = await tx
      .insert(chatConversations)
      .values({
        type: "direct",
        context: "portal",
        applicationId,
        portalContextJson: portalContext,
      })
      .returning();

    if (!conversation) throw new Error("createPortalConversation: insert returned no conversation");

    await tx.insert(chatConversationMembers).values([
      {
        conversationId: conversation.id,
        userId: employerUserId,
        participantRole: "employer",
      },
      {
        conversationId: conversation.id,
        userId: seekerUserId,
        participantRole: "seeker",
      },
    ]);

    return conversation;
  });
}

/**
 * Find the active portal conversation for a given application ID.
 * Uses the unique partial index for efficient lookup.
 * Returns null if not found.
 */
export async function getPortalConversationByApplicationId(
  applicationId: string,
): Promise<PortalConversationWithMembers | null> {
  const [conversation] = await db
    .select()
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.applicationId, applicationId),
        eq(chatConversations.context, "portal"),
        isNull(chatConversations.deletedAt),
      ),
    )
    .limit(1);

  if (!conversation) return null;

  const memberRows = await db
    .select({
      userId: chatConversationMembers.userId,
      participantRole: chatConversationMembers.participantRole,
    })
    .from(chatConversationMembers)
    .where(eq(chatConversationMembers.conversationId, conversation.id));

  return {
    conversation,
    members: memberRows.map((r) => ({
      userId: r.userId,
      participantRole: r.participantRole,
    })),
  };
}

/**
 * List portal conversations for a user.
 * Delegates to getUserConversations with context='portal' for semantic clarity.
 */
export async function getPortalConversationsForUser(
  userId: string,
  options?: { limit?: number; cursor?: string },
): Promise<{ conversations: EnrichedUserConversation[]; hasMore: boolean }> {
  return getUserConversations(userId, { ...options, context: "portal" });
}

/**
 * Check if a portal conversation is read-only due to the application being in a terminal state.
 * Returns true when the application status is 'hired', 'rejected', or 'withdrawn'.
 * Returns true (fail-closed) if the application is not found.
 *
 * Uses raw SQL to read portal_applications table directly — avoids importing
 * portal-applications.ts which has `server-only` (crashes the realtime server).
 */
export async function isPortalConversationReadOnly(applicationId: string): Promise<boolean> {
  const rows = await db.execute(
    sql`SELECT status FROM portal_applications WHERE id = ${applicationId}::uuid LIMIT 1`,
  );
  const row = rows[0] as { status: string } | undefined;
  if (!row) return true; // fail-closed: application not found → treat as read-only
  return (TERMINAL_STATES as readonly string[]).includes(row.status);
}

/**
 * Get the participant_role for a user in a portal conversation.
 * Returns null if the user is not a member of the conversation.
 */
export async function getPortalConversationParticipantRole(
  conversationId: string,
  userId: string,
): Promise<ParticipantRole | null> {
  const [row] = await db
    .select({ participantRole: chatConversationMembers.participantRole })
    .from(chatConversationMembers)
    .innerJoin(
      chatConversations,
      and(
        eq(chatConversations.id, chatConversationMembers.conversationId),
        eq(chatConversations.context, "portal"),
      ),
    )
    .where(
      and(
        eq(chatConversationMembers.conversationId, conversationId),
        eq(chatConversationMembers.userId, userId),
      ),
    )
    .limit(1);

  return row?.participantRole ?? null;
}
