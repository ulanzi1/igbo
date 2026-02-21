// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
} from "./api-response";

describe("successResponse", () => {
  it("returns JSON response with data field", async () => {
    const response = successResponse({ id: 1, name: "Test" });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");

    const body = await response.json();
    expect(body).toEqual({ data: { id: 1, name: "Test" } });
  });

  it("includes pagination meta when provided", async () => {
    const response = successResponse([{ id: 1 }, { id: 2 }], {
      page: 1,
      pageSize: 10,
      total: 50,
    });

    const body = await response.json();
    expect(body).toEqual({
      data: [{ id: 1 }, { id: 2 }],
      meta: { page: 1, pageSize: 10, total: 50 },
    });
  });

  it("supports custom status code", async () => {
    const response = successResponse({ created: true }, undefined, 201);
    expect(response.status).toBe(201);
  });
});

describe("errorResponse", () => {
  it("returns RFC 7807 Problem Details response", async () => {
    const response = errorResponse({
      type: "https://example.com/not-found",
      title: "Not Found",
      status: 404,
      detail: "User not found",
      instance: "/api/v1/users/123",
    });

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe(
      "application/problem+json",
    );

    const body = await response.json();
    expect(body).toEqual({
      type: "https://example.com/not-found",
      title: "Not Found",
      status: 404,
      detail: "User not found",
      instance: "/api/v1/users/123",
    });
  });

  it("omits undefined fields", async () => {
    const response = errorResponse({
      type: "about:blank",
      title: "Bad Request",
      status: 400,
    });

    const body = await response.json();
    expect(body).toEqual({
      type: "about:blank",
      title: "Bad Request",
      status: 400,
    });
    expect("detail" in body).toBe(false);
    expect("instance" in body).toBe(false);
  });
});

describe("validationErrorResponse", () => {
  it("returns 422 with field-level errors", async () => {
    const response = validationErrorResponse({
      email: ["Invalid email format"],
      name: ["Name is required", "Name must be at least 2 characters"],
    });

    expect(response.status).toBe(422);
    expect(response.headers.get("Content-Type")).toBe(
      "application/problem+json",
    );

    const body = await response.json();
    expect(body.type).toBe("about:blank");
    expect(body.title).toBe("Validation Error");
    expect(body.status).toBe(422);
    expect(body.detail).toEqual({
      fieldErrors: {
        email: ["Invalid email format"],
        name: ["Name is required", "Name must be at least 2 characters"],
      },
    });
  });
});
