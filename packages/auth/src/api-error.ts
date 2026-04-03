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
