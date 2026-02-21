import type { ProblemDetails } from "./api-error";

interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

export function successResponse<T>(
  data: T,
  meta?: PaginationMeta,
  status: number = 200,
): Response {
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

export function validationErrorResponse(
  fieldErrors: Record<string, string[]>,
): Response {
  return errorResponse({
    type: "about:blank",
    title: "Validation Error",
    status: 422,
    detail: { fieldErrors },
  });
}
