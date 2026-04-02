import { withApiHandler } from "@/server/api/middleware";
import { ApiError } from "@/lib/api-error";
import { getExportRequestByToken } from "@/db/queries/gdpr";

const handler = async (request: Request): Promise<Response> => {
  // Extract token from URL path: /api/v1/user/account/export/download/{token}
  const segments = new URL(request.url).pathname.split("/");
  const token = segments[segments.length - 1] ?? "";

  if (!token) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Download token not found" });
  }

  const exportRequest = await getExportRequestByToken(token);

  if (!exportRequest) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Download token not found" });
  }

  if (exportRequest.status === "expired") {
    throw new ApiError({ title: "Gone", status: 410, detail: "This download link has expired" });
  }

  if (exportRequest.expiresAt && exportRequest.expiresAt < new Date()) {
    throw new ApiError({ title: "Gone", status: 410, detail: "This download link has expired" });
  }

  if (!exportRequest.exportData) {
    throw new ApiError({ title: "Not Found", status: 404, detail: "Export data not available" });
  }

  const json = JSON.stringify(exportRequest.exportData, null, 2);

  return new Response(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="my-data-export.json"',
    },
  });
};

export const GET = withApiHandler(handler);
