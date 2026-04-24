import "server-only";
import {
  db,
  createPortalConversation,
  getPortalConversationByApplicationId,
  getPortalConversationsForUser,
} from "@igbo/db";
import {
  createMessage,
  getConversationMessages as getConversationMessagesDb,
} from "@igbo/db/queries/chat-messages";
import { isConversationMember } from "@igbo/db/queries/chat-conversations";
import type { EnrichedUserConversation } from "@igbo/db/queries/chat-conversations";
import type { ChatMessage } from "@igbo/db/queries/chat-messages";
import {
  createMessageAttachments,
  getAttachmentsForMessages,
} from "@igbo/db/queries/chat-message-attachments";
import type { ChatMessageAttachment } from "@igbo/db/queries/chat-message-attachments";
import { getFileUploadById } from "@igbo/db/queries/file-uploads";
import { sql } from "drizzle-orm";
import { portalEventBus } from "@/services/event-bus";
import { ApiError } from "@/lib/api-error";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import { buildS3PublicUrl } from "@/lib/build-s3-public-url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApplicationContext {
  applicationId: string;
  seekerUserId: string;
  employerUserId: string;
  status: string;
  jobId: string;
  jobTitle: string;
  companyId: string;
  companyName: string;
}

export interface MessageAttachment {
  id: string;
  fileUrl: string;
  fileName: string;
  fileType: string | null;
  fileSize: number | null;
}

export interface PortalMessageWithAttachments extends ChatMessage {
  _attachments?: MessageAttachment[];
}

export interface SendPortalMessageParams {
  applicationId: string;
  senderId: string;
  /** From session.user.activePortalRole */
  senderPortalRole: "EMPLOYER" | "JOB_SEEKER";
  content: string;
  contentType?: string;
  parentMessageId?: string | null;
  /** File upload IDs to attach (max 3, must be status=ready, uploaderId=sender) */
  attachmentFileUploadIds?: string[];
}

export interface SendPortalMessageResult {
  conversationId: string;
  message: ChatMessage;
  conversationCreated: boolean;
  attachments: MessageAttachment[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getApplicationContext(applicationId: string): Promise<ApplicationContext | null> {
  const rows = await db.execute(sql`
    SELECT
      a.id AS application_id,
      a.seeker_user_id,
      a.status,
      j.id AS job_id,
      j.employer_user_id,
      j.title AS job_title,
      c.id AS company_id,
      c.company_name
    FROM portal_applications a
    JOIN portal_job_postings j ON j.id = a.job_id
    JOIN portal_company_profiles c ON c.id = j.company_id
    WHERE a.id = ${applicationId}::uuid
    LIMIT 1
  `);

  const row = rows[0] as
    | {
        application_id: string;
        seeker_user_id: string;
        status: string;
        job_id: string;
        employer_user_id: string;
        job_title: string;
        company_id: string;
        company_name: string;
      }
    | undefined;

  if (!row) return null;

  return {
    applicationId: row.application_id,
    seekerUserId: row.seeker_user_id,
    employerUserId: row.employer_user_id,
    status: row.status,
    jobId: row.job_id,
    jobTitle: row.job_title,
    companyId: row.company_id,
    companyName: row.company_name,
  };
}

function isUniqueViolationError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

/**
 * Validate attachment file upload IDs before inserting a message.
 * Returns attachment values for insertion into chatMessageAttachments.
 */
async function validateAndBuildAttachmentValues(
  attachmentFileUploadIds: string[],
  senderId: string,
): Promise<Omit<ChatMessageAttachment, "id" | "messageId" | "createdAt">[]> {
  if (attachmentFileUploadIds.length > 3) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Maximum 3 attachments per message",
    });
  }

  const attachmentValues: Omit<ChatMessageAttachment, "id" | "messageId" | "createdAt">[] = [];

  for (const fileUploadId of attachmentFileUploadIds) {
    const upload = await getFileUploadById(fileUploadId);
    if (!upload) {
      throw new ApiError({
        title: "Bad Request",
        status: 400,
        detail: `File upload not found: ${fileUploadId}`,
      });
    }
    if (upload.uploaderId !== senderId) {
      throw new ApiError({
        title: "Bad Request",
        status: 400,
        detail: `File upload ${fileUploadId} does not belong to sender`,
      });
    }
    if (upload.status !== "ready") {
      throw new ApiError({
        title: "Bad Request",
        status: 400,
        detail: `File upload ${fileUploadId} is not ready (status: ${upload.status})`,
      });
    }

    // Denormalize fields — processedUrl is always null for portal uploads (no async pipeline)
    const fileUrl = upload.processedUrl ?? buildS3PublicUrl(upload.objectKey);
    attachmentValues.push({
      fileUploadId,
      fileUrl,
      fileName: upload.originalFilename ?? "file",
      fileType: upload.fileType ?? null,
      fileSize: upload.fileSize ?? null,
    });
  }

  return attachmentValues;
}

function toMessageAttachments(rows: ChatMessageAttachment[]): MessageAttachment[] {
  return rows.map((a) => ({
    id: a.id,
    fileUrl: a.fileUrl,
    fileName: a.fileName,
    fileType: a.fileType ?? null,
    fileSize: a.fileSize ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Exported service functions
// ---------------------------------------------------------------------------

/**
 * Send a portal message for a given application.
 * Auto-creates the conversation on the employer's first message (atomic tx).
 * Enforces seeker-cannot-initiate and read-only-on-terminal-state rules.
 */
export async function sendMessage(
  params: SendPortalMessageParams,
): Promise<SendPortalMessageResult> {
  const {
    applicationId,
    senderId,
    senderPortalRole,
    content,
    contentType,
    parentMessageId,
    attachmentFileUploadIds = [],
  } = params;

  // Step 1: Validate content — empty content allowed when attachments are present
  const trimmedContent = content.trim();
  const hasAttachments = attachmentFileUploadIds.length > 0;
  if (trimmedContent.length === 0 && !hasAttachments) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Message content cannot be empty",
    });
  }
  if (trimmedContent.length > 5000) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: "Message content exceeds maximum length of 5000 characters",
    });
  }

  // Step 1b: Validate attachments (before any DB writes)
  const attachmentValues = hasAttachments
    ? await validateAndBuildAttachmentValues(attachmentFileUploadIds, senderId)
    : [];

  // Step 2: Get application context
  const appCtx = await getApplicationContext(applicationId);
  if (!appCtx) {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      detail: PORTAL_ERRORS.MESSAGING_APPLICATION_NOT_FOUND,
    });
  }

  // Step 3: Check terminal state (read-only)
  const TERMINAL_STATES = ["hired", "rejected", "withdrawn"];
  if (TERMINAL_STATES.includes(appCtx.status)) {
    throw new ApiError({
      title: "Forbidden",
      status: 403,
      detail: PORTAL_ERRORS.CONVERSATION_READ_ONLY,
    });
  }

  // Step 4: Map portal role to participant role
  const senderRole: "employer" | "seeker" = senderPortalRole === "EMPLOYER" ? "employer" : "seeker";

  // Step 5: Look up existing conversation
  const existing = await getPortalConversationByApplicationId(applicationId);

  let conversationId: string;
  let message: ChatMessage;
  let conversationCreated = false;
  let insertedAttachments: ChatMessageAttachment[] = [];

  if (!existing) {
    // No conversation yet — seeker can NEVER create the first conversation
    if (senderRole === "seeker") {
      if (appCtx.status === "submitted") {
        throw new ApiError({
          title: "Forbidden",
          status: 403,
          detail: PORTAL_ERRORS.SEEKER_CANNOT_INITIATE,
        });
      }
      throw new ApiError({ title: "Not Found", status: 404 });
    }

    // Employer initiates — validate sender is the employer for this application
    if (senderId !== appCtx.employerUserId) {
      throw new ApiError({ title: "Not Found", status: 404 });
    }

    // Step 6a: Create conversation + message atomically
    try {
      const txResult = await db.transaction(async (tx) => {
        const conv = await createPortalConversation(
          {
            applicationId,
            employerUserId: appCtx.employerUserId,
            seekerUserId: appCtx.seekerUserId,
            portalContext: {
              jobId: appCtx.jobId,
              companyId: appCtx.companyId,
              jobTitle: appCtx.jobTitle,
              companyName: appCtx.companyName,
            },
          },
          tx,
        );
        const msg = await createMessage(
          {
            conversationId: conv.id,
            senderId,
            content: trimmedContent,
            contentType: (contentType ?? "text") as "text",
            parentMessageId: parentMessageId ?? null,
          },
          tx,
        );
        const atts =
          attachmentValues.length > 0
            ? await createMessageAttachments(msg.id, attachmentValues, tx)
            : [];
        return { conv, msg, atts };
      });

      conversationId = txResult.conv.id;
      message = txResult.msg;
      insertedAttachments = txResult.atts;
      conversationCreated = true;
    } catch (err) {
      if (isUniqueViolationError(err)) {
        // Race condition: another request created the conversation simultaneously
        const raceConv = await getPortalConversationByApplicationId(applicationId);
        if (!raceConv) {
          throw new ApiError({
            title: "Conflict",
            status: 409,
            detail: "Conversation was created and deleted concurrently — please retry",
          });
        }

        conversationId = raceConv.conversation.id;
        // Wrap recovery in transaction for atomicity with attachments
        const recoveryResult = await db.transaction(async (tx) => {
          const msg = await createMessage(
            {
              conversationId,
              senderId,
              content: trimmedContent,
              contentType: (contentType ?? "text") as "text",
              parentMessageId: parentMessageId ?? null,
            },
            tx,
          );
          const atts =
            attachmentValues.length > 0
              ? await createMessageAttachments(msg.id, attachmentValues, tx)
              : [];
          return { msg, atts };
        });
        message = recoveryResult.msg;
        insertedAttachments = recoveryResult.atts;
        conversationCreated = false;
      } else {
        throw err;
      }
    }
  } else {
    // Step 6b: Conversation exists — validate sender is a participant
    const isMember = await isConversationMember(existing.conversation.id, senderId, "portal");
    if (!isMember) {
      throw new ApiError({ title: "Not Found", status: 404 });
    }

    conversationId = existing.conversation.id;
    const txResult = await db.transaction(async (tx) => {
      const msg = await createMessage(
        {
          conversationId,
          senderId,
          content: trimmedContent,
          contentType: (contentType ?? "text") as "text",
          parentMessageId: parentMessageId ?? null,
        },
        tx,
      );
      const atts =
        attachmentValues.length > 0
          ? await createMessageAttachments(msg.id, attachmentValues, tx)
          : [];
      return { msg, atts };
    });
    message = txResult.msg;
    insertedAttachments = txResult.atts;
  }

  // Step 7: Emit event AFTER transaction commit
  const recipientId = senderRole === "employer" ? appCtx.seekerUserId : appCtx.employerUserId;
  const attachmentsPayload = toMessageAttachments(insertedAttachments);

  portalEventBus.emit("portal.message.sent", {
    messageId: message.id,
    senderId,
    conversationId,
    applicationId,
    jobId: appCtx.jobId,
    companyId: appCtx.companyId,
    jobTitle: appCtx.jobTitle,
    companyName: appCtx.companyName,
    content: trimmedContent,
    contentType: contentType ?? "text",
    createdAt: message.createdAt.toISOString(),
    parentMessageId: parentMessageId ?? null,
    recipientId,
    senderName: undefined,
    senderRole,
    attachments: attachmentsPayload,
  });

  return { conversationId, message, conversationCreated, attachments: attachmentsPayload };
}

/**
 * Get paginated messages for a portal conversation, with attachments batch-loaded.
 * Returns 404 for non-participants and for missing conversations.
 */
export async function getPortalConversationMessages(
  applicationId: string,
  userId: string,
  options?: { cursor?: string; limit?: number },
): Promise<{ messages: PortalMessageWithAttachments[]; hasMore: boolean }> {
  const conv = await getPortalConversationByApplicationId(applicationId);
  if (!conv) {
    throw new ApiError({ title: "Not Found", status: 404 });
  }

  const isMember = await isConversationMember(conv.conversation.id, userId, "portal");
  if (!isMember) {
    throw new ApiError({ title: "Not Found", status: 404 });
  }

  const { messages, hasMore } = await getConversationMessagesDb(conv.conversation.id, options);

  if (messages.length === 0) return { messages: [], hasMore };

  // Batch-load attachments (N+1 prevention)
  const messageIds = messages.map((m) => m.id);
  const allAttachments = await getAttachmentsForMessages(messageIds);

  // Group attachments by messageId
  const attachmentsByMessageId = new Map<string, MessageAttachment[]>();
  for (const att of allAttachments) {
    const existing = attachmentsByMessageId.get(att.messageId) ?? [];
    existing.push({
      id: att.id,
      fileUrl: att.fileUrl,
      fileName: att.fileName,
      fileType: att.fileType ?? null,
      fileSize: att.fileSize ?? null,
    });
    attachmentsByMessageId.set(att.messageId, existing);
  }

  const enriched: PortalMessageWithAttachments[] = messages.map((msg) => ({
    ...msg,
    _attachments: attachmentsByMessageId.get(msg.id) ?? [],
  }));

  return { messages: enriched, hasMore };
}

/**
 * List all portal conversations for a user.
 */
export async function listUserConversations(
  userId: string,
  options?: { cursor?: string; limit?: number },
): Promise<{ conversations: EnrichedUserConversation[]; hasMore: boolean }> {
  return getPortalConversationsForUser(userId, options);
}

/**
 * Get the status of a portal conversation for a given application.
 * Used by UI (P-5.5) to determine messaging button state.
 * Returns 404 for non-participants (consistent with 404-not-403 invariant).
 */
export async function getConversationStatus(
  applicationId: string,
  userId: string,
): Promise<{ exists: boolean; readOnly: boolean }> {
  const appCtx = await getApplicationContext(applicationId);
  if (!appCtx) {
    throw new ApiError({ title: "Not Found", status: 404 });
  }
  if (userId !== appCtx.seekerUserId && userId !== appCtx.employerUserId) {
    throw new ApiError({ title: "Not Found", status: 404 });
  }

  const conv = await getPortalConversationByApplicationId(applicationId);
  const TERMINAL = ["hired", "rejected", "withdrawn"];
  const readOnly = TERMINAL.includes(appCtx.status);
  return { exists: conv !== null, readOnly };
}
