import "server-only";
import { ApiError } from "@/lib/api-error";

/**
 * Validates internal machine-to-machine authentication via Authorization: Bearer header.
 * Fail-closed: if INTERNAL_JOB_SECRET env var is missing, throws 401 (misconfiguration, not "allow").
 * For local testing: set INTERNAL_JOB_SECRET=dev-secret in .env.local and call with
 *   Authorization: Bearer dev-secret
 */
export function requireInternalAuth(req: Request): void {
  const secret = process.env.INTERNAL_JOB_SECRET; // ci-allow-process-env
  if (!secret) {
    throw new ApiError({ title: "INTERNAL_JOB_SECRET is not configured", status: 401 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    throw new ApiError({ title: "Unauthorized", status: 401 });
  }
}
