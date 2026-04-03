import { withApiHandler } from "@/server/api/middleware";
import { successResponse } from "@/lib/api-response";
import { ApiError } from "@/lib/api-error";
import { auth } from "@igbo/auth";
import {
  getPublicProfileForViewer,
  getProfileWithSocialLinks,
} from "@igbo/db/queries/community-profiles";

type ViewerRole = "MEMBER" | "ADMIN" | "MODERATOR";

function isViewerRole(role: unknown): role is ViewerRole {
  return role === "MEMBER" || role === "ADMIN" || role === "MODERATOR";
}

export const GET = withApiHandler(async (request: Request) => {
  const session = await auth();
  if (!session?.user?.id) {
    throw new ApiError({ title: "Unauthorized", status: 401 });
  }

  const viewerUserId = session.user.id;
  const viewerRole = isViewerRole(session.user.role) ? session.user.role : "MEMBER";

  const url = new URL(request.url);
  const pathParts = url.pathname.split("/");
  const rawSegment = pathParts[pathParts.length - 1] ?? "";
  const targetUserId = rawSegment === "me" ? viewerUserId : rawSegment;

  if (viewerUserId === targetUserId) {
    // Own profile: return full profile including social links
    const { profile, socialLinks } = await getProfileWithSocialLinks(viewerUserId);
    if (!profile) {
      throw new ApiError({ title: "Not Found", status: 404 });
    }
    return successResponse({ profile, socialLinks });
  }

  const { profile, socialLinks } = await getPublicProfileForViewer(
    viewerUserId,
    targetUserId,
    viewerRole,
  );

  if (!profile) {
    throw new ApiError({ title: "Not Found", status: 404 });
  }

  return successResponse({ profile, socialLinks });
});
