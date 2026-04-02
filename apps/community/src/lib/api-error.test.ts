// @vitest-environment node
import { describe, it, expect } from "vitest";
import { ApiError } from "./api-error";

describe("ApiError", () => {
  it("creates an error with all RFC 7807 fields", () => {
    const error = new ApiError({
      type: "https://example.com/not-found",
      title: "Not Found",
      status: 404,
      detail: "The requested resource was not found",
      instance: "/api/v1/users/123",
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.type).toBe("https://example.com/not-found");
    expect(error.title).toBe("Not Found");
    expect(error.status).toBe(404);
    expect(error.detail).toBe("The requested resource was not found");
    expect(error.instance).toBe("/api/v1/users/123");
    expect(error.message).toBe("Not Found");
  });

  it("creates an error with minimal fields", () => {
    const error = new ApiError({
      title: "Bad Request",
      status: 400,
    });

    expect(error.title).toBe("Bad Request");
    expect(error.status).toBe(400);
    expect(error.type).toBe("about:blank");
    expect(error.detail).toBeUndefined();
    expect(error.instance).toBeUndefined();
  });

  it("supports extension members", () => {
    const error = new ApiError({
      title: "Validation Error",
      status: 422,
      detail: "Request validation failed",
      extensions: {
        fieldErrors: { email: ["Invalid email format"] },
      },
    });

    expect(error.extensions).toEqual({
      fieldErrors: { email: ["Invalid email format"] },
    });
  });

  it("serializes to RFC 7807 JSON via toProblemDetails()", () => {
    const error = new ApiError({
      type: "https://example.com/forbidden",
      title: "Forbidden",
      status: 403,
      detail: "Insufficient permissions",
      instance: "/api/v1/admin/users",
      extensions: { requiredRole: "admin" },
    });

    const json = error.toProblemDetails();

    expect(json).toEqual({
      type: "https://example.com/forbidden",
      title: "Forbidden",
      status: 403,
      detail: "Insufficient permissions",
      instance: "/api/v1/admin/users",
      requiredRole: "admin",
    });
  });

  it("omits undefined fields from toProblemDetails()", () => {
    const error = new ApiError({
      title: "Internal Server Error",
      status: 500,
    });

    const json = error.toProblemDetails();
    expect(json).toEqual({
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
    });
    expect("detail" in json).toBe(false);
    expect("instance" in json).toBe(false);
  });

  it("has correct name property", () => {
    const error = new ApiError({ title: "Test", status: 400 });
    expect(error.name).toBe("ApiError");
  });
});
