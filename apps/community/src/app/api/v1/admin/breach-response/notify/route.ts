import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { requireAdminSession } from "@igbo/auth/admin-auth";
import { db } from "@igbo/db";
import { authUsers } from "@igbo/db/schema/auth-users";
import { auditLogs } from "@igbo/db/schema/audit-logs";
import { inArray } from "drizzle-orm";
import { enqueueEmailJob } from "@/services/email-service";
import { z } from "zod/v4";

const schema = z.object({
  userIds: z.array(z.string().uuid()).min(1),
  incidentTimestamp: z.string().min(1),
  notificationMessage: z.string().min(1).max(2000),
});

const handler = async (request: Request) => {
  const { adminId } = await requireAdminSession();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError({ title: "Bad Request", status: 400, detail: "Invalid JSON body" });
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError({
      title: "Bad Request",
      status: 400,
      detail: result.error.issues[0]?.message ?? "Validation failed",
    });
  }

  const { userIds, incidentTimestamp, notificationMessage } = result.data;

  // Fetch affected members
  const members = await db
    .select({ id: authUsers.id, email: authUsers.email, name: authUsers.name })
    .from(authUsers)
    .where(inArray(authUsers.id, userIds));

  // Send notification emails
  for (const member of members) {
    enqueueEmailJob(`breach-notify-${member.id}`, {
      to: member.email,
      subject: "Important security notice regarding your account",
      templateId: "gdpr-breach-notification",
      data: {
        name: member.name ?? member.email,
        incidentTimestamp,
        notificationMessage,
      },
    });
  }

  // Log incident to audit trail
  await db.insert(auditLogs).values({
    actorId: adminId,
    action: "admin.breach_notification_sent",
    details: {
      affectedCount: members.length,
      userIds,
      incidentTimestamp,
    },
    ipAddress: null,
  });

  return successResponse({
    message: `Breach notification sent to ${members.length} members`,
    notifiedCount: members.length,
  });
};

export const POST = withApiHandler(handler);
