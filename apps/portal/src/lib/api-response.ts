import type { ProblemDetails } from "./api-error";

/**
 * ## Error Handling Patterns
 *
 * `errorResponse` takes a SINGLE ProblemDetails object — it does NOT accept
 * positional (status, title, detail) arguments. This is a common source of bugs.
 *
 * For route handlers, always throw `ApiError` instead of calling `errorResponse`
 * directly. `withApiHandler` catches `ApiError` and converts it to an RFC 7807
 * response automatically, preserving the status code.
 *
 * ✅ CORRECT — throw ApiError from route handlers:
 * ```ts
 * import { ApiError } from "@/lib/api-error";
 *
 * throw new ApiError({ title: "Not Found", status: 404, detail: "Company not found" });
 * throw new ApiError({ title: "Forbidden", status: 403 });
 * ```
 *
 * ✅ CORRECT — call errorResponse directly only when outside withApiHandler:
 * ```ts
 * return errorResponse({ type: "about:blank", title: "Bad Request", status: 400 });
 * ```
 *
 * ❌ WRONG — errorResponse does NOT accept positional arguments:
 * ```ts
 * return errorResponse(400, "Bad Request", "Invalid company ID"); // TypeError at runtime
 * ```
 *
 * Non-ApiError exceptions thrown inside withApiHandler become HTTP 500.
 */

interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

export function successResponse<T>(data: T, meta?: PaginationMeta, status: number = 200): Response {
  const body: { data: T; meta?: PaginationMeta } = { data };
  if (meta) {
    body.meta = meta;
  }

  return Response.json(body, { status });
}

export function errorResponse(problem: ProblemDetails): Response {
  const body: Record<string, unknown> = {
    type: problem.type,
    title: problem.title,
    status: problem.status,
  };

  if (problem.detail !== undefined) {
    body.detail = problem.detail;
  }

  if (problem.instance !== undefined) {
    body.instance = problem.instance;
  }

  // Copy any extension members
  for (const [key, value] of Object.entries(problem)) {
    if (!["type", "title", "status", "detail", "instance"].includes(key)) {
      body[key] = value;
    }
  }

  return new Response(JSON.stringify(body), {
    status: problem.status,
    headers: { "Content-Type": "application/problem+json" },
  });
}

export function validationErrorResponse(fieldErrors: Record<string, string[]>): Response {
  return errorResponse({
    type: "about:blank",
    title: "Validation Error",
    status: 422,
    detail: "One or more fields failed validation",
    fieldErrors,
  });
}
