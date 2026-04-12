import "server-only";
import { z } from "zod/v4";
import { requireEmployerRole } from "@/lib/portal-permissions";
import { withApiHandler } from "@/lib/api-middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import {
  createApplicationNote,
  getNotesByApplicationId,
} from "@igbo/db/queries/portal-application-notes";
import { getApplicationDetailForEmployer } from "@igbo/db/queries/portal-applications";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";

/**
 * P-2.10: Employer notes on an application.
 *
 * POST creates a new private note; notes are immutable (no update/delete).
 * GET returns chronological list. Both routes enforce employer-only access
 * and the 404-not-403 ownership policy via the company→job→application chain.
 */

const createNoteSchema = z.object({
  content: z.string().min(1).max(2000),
});

function extractApplicationId(req: Request): string {
  // URL: /api/v1/applications/{applicationId}/notes
  // "notes" is at(-1), applicationId at(-2)
  const segments = new URL(req.url).pathname.split("/");
  const applicationId = segments.at(-2);
  const idValidation = z.string().uuid().safeParse(applicationId);
  if (!idValidation.success) {
    throw new ApiError({ title: "Invalid applicationId", status: 400 });
  }
  return idValidation.data;
}

async function verifyOwnership(applicationId: string, ownerUserId: string): Promise<void> {
  const company = await getCompanyByOwnerId(ownerUserId);
  if (!company) {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }
  const application = await getApplicationDetailForEmployer(applicationId, company.id);
  if (!application) {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }
}

export const POST = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await requireEmployerRole();
  const applicationId = extractApplicationId(req);

  const body = (await req.json()) as unknown;
  const parsed = createNoteSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError({
      title: parsed.error.issues[0]?.message ?? "Validation failed",
      status: 400,
    });
  }

  await verifyOwnership(applicationId, session.user.id);

  const note = await createApplicationNote({
    applicationId,
    authorUserId: session.user.id,
    content: parsed.data.content,
  });

  return successResponse(note, undefined, 201);
});

export const GET = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await requireEmployerRole();
  const applicationId = extractApplicationId(req);

  await verifyOwnership(applicationId, session.user.id);

  const notes = await getNotesByApplicationId(applicationId);
  return successResponse({ notes });
});
