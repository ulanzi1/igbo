import "server-only";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { auth } from "@igbo/auth";
import { getFileUploadById } from "@igbo/db/queries/file-uploads";
import { getAttachmentByFileUploadId } from "@igbo/db/queries/chat-message-attachments";
import { getMessageById } from "@igbo/db/queries/chat-messages";
import { isConversationMember } from "@igbo/db/queries/chat-conversations";
import { ApiError } from "@/lib/api-error";
import { withApiHandler } from "@/lib/api-middleware";
import { getPortalS3Client } from "@/lib/s3-client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractFileUploadId(url: string): string {
  const segments = new URL(url).pathname.split("/");
  return segments[segments.length - 1] ?? "";
}

export const GET = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await auth();
  if (!session?.user) {
    throw new ApiError({ title: "Authentication required", status: 401 });
  }

  const fileUploadId = extractFileUploadId(req.url);
  if (!fileUploadId || !UUID_RE.test(fileUploadId)) {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid fileUploadId" });
  }

  // Step 1: Verify file upload exists and is downloadable
  const upload = await getFileUploadById(fileUploadId);
  if (!upload || upload.status === "quarantined" || upload.status === "deleted") {
    throw new ApiError({ title: "Not Found", status: 404 });
  }

  // Step 2: Find the attachment record linking this file to a message
  const attachment = await getAttachmentByFileUploadId(fileUploadId);
  if (!attachment) {
    throw new ApiError({ title: "Not Found", status: 404 });
  }

  // Step 3: Find the message to get the conversationId
  const message = await getMessageById(attachment.messageId);
  if (!message) {
    throw new ApiError({ title: "Not Found", status: 404 });
  }

  // Step 4: Verify the requesting user is a conversation participant (404-not-403)
  const isMember = await isConversationMember(message.conversationId, session.user.id, "portal");
  if (!isMember) {
    throw new ApiError({ title: "Not Found", status: 404 });
  }

  // Step 5: Generate signed S3 URL (5-minute expiry)
  const s3Client = getPortalS3Client();
  const command = new GetObjectCommand({
    Bucket: process.env.HETZNER_S3_BUCKET, // ci-allow-process-env
    Key: upload.objectKey,
  });
  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

  return Response.redirect(signedUrl, 302);
});
