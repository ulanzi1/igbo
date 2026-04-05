// Re-export from @igbo/auth — single source of truth for ApiError.
// This preserves instanceof compatibility: errors thrown by @igbo/auth functions
// are caught correctly by `if (error instanceof ApiError)` in the middleware.
export { ApiError, type ProblemDetails } from "@igbo/auth/api-error";
