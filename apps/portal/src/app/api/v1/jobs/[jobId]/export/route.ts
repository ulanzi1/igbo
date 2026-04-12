import "server-only";
import { z } from "zod/v4";
import { withApiHandler } from "@/lib/api-middleware";
import { requireEmployerRole } from "@/lib/portal-permissions";
import { ApiError } from "@/lib/api-error";
import { PORTAL_ERRORS } from "@/lib/portal-errors";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { getJobPostingWithCompany } from "@igbo/db/queries/portal-job-postings";
import { getApplicationsForExport } from "@igbo/db/queries/portal-applications";

/**
 * Wraps a CSV field value in double-quotes if it contains a comma, double-quote,
 * or newline/carriage-return. Internal double-quotes are escaped by doubling them.
 * Guards against CSV formula injection by prefixing fields that start with
 * formula-trigger characters (=, +, -, @, \t, \r) with a single-quote inside quotes.
 * Returns an empty string for null/undefined input.
 */
const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;

function escapeCsvField(value: string | null | undefined): string {
  if (value == null || value === "") return "";
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  if (CSV_FORMULA_PREFIX.test(value)) {
    return `"'${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Sanitizes a string for use in a Content-Disposition filename.
 * Replaces spaces and non-alphanumeric characters with hyphens,
 * collapses consecutive hyphens, trims edges, and truncates to 50 chars.
 */
function sanitizeForFilename(str: string): string {
  const result = str
    .replace(/[^a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  return result || "export";
}

export const GET = withApiHandler(async (req: Request): Promise<Response> => {
  const session = await requireEmployerRole();

  // Extract jobId from URL: /api/v1/jobs/{jobId}/export → jobId is at(-2)
  const segments = new URL(req.url).pathname.split("/");
  const jobId = segments.at(-2);

  const idValidation = z.string().uuid().safeParse(jobId);
  if (!idValidation.success) {
    throw new ApiError({ title: "Invalid jobId", status: 400 });
  }

  // Ownership check: 404-not-403 to prevent information leakage
  const company = await getCompanyByOwnerId(session.user.id);
  if (!company) {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  // Verify job exists and belongs to employer's company
  const postingResult = await getJobPostingWithCompany(idValidation.data);
  if (!postingResult || postingResult.posting.companyId !== company.id) {
    throw new ApiError({
      title: "Not Found",
      status: 404,
      extensions: { code: PORTAL_ERRORS.NOT_FOUND },
    });
  }

  const { posting, company: postingCompany } = postingResult;
  const applications = await getApplicationsForExport(idValidation.data, company.id);

  // Build CSV content
  const BOM = "\uFEFF";
  const header = "Name,Email,Headline,Status,Applied Date,Last Status Change";

  const rows = applications.map((app) => {
    const name = escapeCsvField(app.seekerName);
    const email = app.consentEmployerView === true ? escapeCsvField(app.seekerEmail) : "\u2014";
    const headline = escapeCsvField(app.seekerHeadline);
    const status = app.status;
    const appliedDate = app.createdAt.toISOString().split("T")[0] ?? "";
    const lastStatusChange = app.transitionedAt
      ? (app.transitionedAt.toISOString().split("T")[0] ?? "")
      : "";
    return `${name},${email},${headline},${status},${appliedDate},${lastStatusChange}`;
  });

  const csvContent = [BOM + header, ...rows].join("\n");

  // Build filename: {company-name}_{job-title}_candidates_{YYYY-MM-DD}.csv
  const dateStr = new Date().toISOString().split("T")[0] ?? "";
  const companySlug = sanitizeForFilename(postingCompany.name);
  const titleSlug = sanitizeForFilename(posting.title);
  const filename = `${companySlug}_${titleSlug}_candidates_${dateStr}.csv`;

  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
