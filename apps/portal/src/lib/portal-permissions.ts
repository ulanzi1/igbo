import "server-only";
import { auth } from "@igbo/auth";
import { ApiError } from "@igbo/auth/api-error";
import { PORTAL_ERRORS } from "./portal-errors";

export async function requireEmployerRole() {
  const session = await auth();
  if (!session?.user) {
    throw new ApiError({ title: "Authentication required", status: 401 });
  }
  if (session.user.activePortalRole !== "EMPLOYER") {
    throw new ApiError({
      title: "Employer role required",
      status: 403,
      extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
    });
  }
  return session;
}

export async function requireJobSeekerRole() {
  const session = await auth();
  if (!session?.user) {
    throw new ApiError({ title: "Authentication required", status: 401 });
  }
  if (session.user.activePortalRole !== "JOB_SEEKER") {
    throw new ApiError({
      title: "Job seeker role required",
      status: 403,
      extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
    });
  }
  return session;
}

export async function requireJobAdminRole() {
  const session = await auth();
  if (!session?.user) {
    throw new ApiError({ title: "Authentication required", status: 401 });
  }
  if (session.user.activePortalRole !== "JOB_ADMIN") {
    throw new ApiError({
      title: "Job admin role required",
      status: 403,
      extensions: { code: PORTAL_ERRORS.ROLE_MISMATCH },
    });
  }
  return session;
}
