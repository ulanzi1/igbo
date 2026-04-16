// NOTE: No "server-only" — ApiError is a pure class/type definition with no server
// dependencies. It must be importable from the community app's @/lib/api-error.ts
// re-export for instanceof checks in the API middleware.

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string | Record<string, unknown>;
  instance?: string;
  [key: string]: unknown;
}

interface ApiErrorOptions {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  extensions?: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string | Record<string, unknown> | undefined;
  readonly instance: string | undefined;
  readonly extensions: Record<string, unknown> | undefined;

  constructor(options: ApiErrorOptions) {
    super(options.title);
    this.name = "ApiError";
    this.type = options.type ?? "about:blank";
    this.title = options.title;
    this.status = options.status;
    this.detail = options.detail;
    this.instance = options.instance;
    this.extensions = options.extensions;
  }

  /**
   * Converts this error to an RFC 7807 Problem Details response body.
   *
   * **Important:** Extensions are spread flat onto the top-level object,
   * NOT nested under an `extensions` key. This matches RFC 7807 §3.2.
   *
   * @example
   * // Given: new ApiError({ title: "Conflict", status: 409, extensions: { code: "DUPLICATE" } })
   * // toProblemDetails() returns:
   * // { type: "about:blank", title: "Conflict", status: 409, code: "DUPLICATE" }
   * //
   * // Client access:
   * // ✅ body.code          → "DUPLICATE"
   * // ❌ body.extensions.code → undefined (extensions is not a key in the response)
   */
  toProblemDetails(): ProblemDetails {
    const result: ProblemDetails = {
      type: this.type,
      title: this.title,
      status: this.status,
    };

    if (this.detail !== undefined) {
      result.detail = this.detail;
    }

    if (this.instance !== undefined) {
      result.instance = this.instance;
    }

    if (this.extensions) {
      Object.assign(result, this.extensions);
    }

    return result;
  }
}
