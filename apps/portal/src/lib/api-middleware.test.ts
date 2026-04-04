// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { withApiHandler } from "./api-middleware";
import { ApiError } from "./api-error";

function makeRequest(method: string, url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { method, headers });
}

describe("withApiHandler — CSRF validation", () => {
  it("passes GET requests without Origin header", async () => {
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withApiHandler(handler);
    const req = makeRequest("GET", "https://jobs.igbo.com/api/v1/companies");
    const res = await wrapped(req);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it("passes POST when Origin matches Host", async () => {
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 201 }));
    const wrapped = withApiHandler(handler);
    const req = makeRequest("POST", "https://jobs.igbo.com/api/v1/companies", {
      Origin: "https://jobs.igbo.com",
      Host: "jobs.igbo.com",
    });
    const res = await wrapped(req);
    expect(res.status).toBe(201);
  });

  it("returns 403 when Origin differs from Host", async () => {
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 201 }));
    const wrapped = withApiHandler(handler);
    const req = makeRequest("POST", "https://jobs.igbo.com/api/v1/companies", {
      Origin: "https://evil.com",
      Host: "jobs.igbo.com",
    });
    const res = await wrapped(req);
    expect(res.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 403 when Origin header is missing on POST", async () => {
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 201 }));
    const wrapped = withApiHandler(handler);
    const req = makeRequest("POST", "https://jobs.igbo.com/api/v1/companies", {
      Host: "jobs.igbo.com",
    });
    const res = await wrapped(req);
    expect(res.status).toBe(403);
  });

  it("skips CSRF validation when skipCsrf: true", async () => {
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withApiHandler(handler, { skipCsrf: true });
    const req = makeRequest("POST", "https://jobs.igbo.com/api/v1/webhook", {
      Host: "jobs.igbo.com",
      // No Origin header
    });
    const res = await wrapped(req);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalled();
  });

  it("passes POST when Origin is in ALLOWED_ORIGINS (cross-subdomain)", async () => {
    const original = process.env.ALLOWED_ORIGINS;
    process.env.ALLOWED_ORIGINS = "https://igbo.com";
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 201 }));
    const wrapped = withApiHandler(handler);
    const req = makeRequest("POST", "https://jobs.igbo.com/api/v1/companies", {
      Origin: "https://igbo.com",
      Host: "jobs.igbo.com",
    });
    const res = await wrapped(req);
    expect(res.status).toBe(201);
    process.env.ALLOWED_ORIGINS = original;
  });
});

describe("withApiHandler — error handling", () => {
  it("catches ApiError and returns RFC 7807 response", async () => {
    const handler = vi
      .fn()
      .mockRejectedValue(
        new ApiError({ title: "Not Found", status: 404, detail: "Company not found" }),
      );
    const wrapped = withApiHandler(handler, { skipCsrf: true });
    const req = makeRequest("GET", "https://jobs.igbo.com/api/v1/companies/abc");
    const res = await wrapped(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.title).toBe("Not Found");
    expect(body.status).toBe(404);
  });

  it("catches unknown errors and returns 500", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("Something unexpected"));
    const wrapped = withApiHandler(handler, { skipCsrf: true });
    const req = makeRequest("GET", "https://jobs.igbo.com/api/v1/companies");
    const res = await wrapped(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.title).toBe("Internal Server Error");
  });

  it("sets X-Request-Id from request header when present", async () => {
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withApiHandler(handler);
    const req = makeRequest("GET", "https://jobs.igbo.com/api/v1/companies", {
      "X-Request-Id": "my-trace-id",
    });
    const res = await wrapped(req);
    expect(res.headers.get("X-Request-Id")).toBe("my-trace-id");
  });

  it("generates X-Request-Id when not in request headers", async () => {
    const handler = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const wrapped = withApiHandler(handler);
    const req = makeRequest("GET", "https://jobs.igbo.com/api/v1/companies");
    const res = await wrapped(req);
    expect(res.headers.get("X-Request-Id")).toBeTruthy();
  });
});
