// @vitest-environment node
import { describe, it, expect } from "vitest";

import { successResponse, errorResponse } from "./api-response";

describe("successResponse", () => {
  it("returns JSON with data wrapper and 200 status by default", async () => {
    const res = successResponse({ id: "1", name: "Test" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ id: "1", name: "Test" });
    expect(body.meta).toBeUndefined();
  });

  it("includes pagination meta when provided", async () => {
    const res = successResponse([1, 2, 3], { page: 1, pageSize: 10, total: 3 });
    const body = await res.json();
    expect(body.data).toEqual([1, 2, 3]);
    expect(body.meta).toEqual({ page: 1, pageSize: 10, total: 3 });
  });

  it("uses provided status code", async () => {
    const res = successResponse({ created: true }, undefined, 201);
    expect(res.status).toBe(201);
  });

  it("returns null data correctly", async () => {
    const res = successResponse(null);
    const body = await res.json();
    expect(body.data).toBeNull();
  });
});

describe("errorResponse", () => {
  it("returns RFC 7807 format with correct status", async () => {
    const res = errorResponse({
      type: "about:blank",
      title: "Not Found",
      status: 404,
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.title).toBe("Not Found");
    expect(body.status).toBe(404);
    expect(body.type).toBe("about:blank");
  });

  it("sets Content-Type to application/problem+json", () => {
    const res = errorResponse({ type: "about:blank", title: "Bad Request", status: 400 });
    expect(res.headers.get("Content-Type")).toBe("application/problem+json");
  });

  it("includes detail and extension members", async () => {
    const res = errorResponse({
      type: "about:blank",
      title: "Conflict",
      status: 409,
      detail: "Duplicate record",
      code: "DUPLICATE",
    });
    const body = await res.json();
    expect(body.detail).toBe("Duplicate record");
    expect(body.code).toBe("DUPLICATE");
  });
});
