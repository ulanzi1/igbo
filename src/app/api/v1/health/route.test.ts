// @vitest-environment node
import { describe, it, expect } from "vitest";
import { GET } from "./route";

function createRequest(
  options: { headers?: Record<string, string> } = {},
): Request {
  return new Request("http://localhost:3000/api/v1/health", {
    method: "GET",
    headers: new Headers({
      Host: "localhost:3000",
      ...options.headers,
    }),
  });
}

describe("GET /api/v1/health", () => {
  it("returns success response with proper format", async () => {
    const request = createRequest();
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveProperty("data");
    expect(body.data).toHaveProperty("status", "ok");
    expect(body.data).toHaveProperty("timestamp");
  });

  it("includes X-Request-Id in response", async () => {
    const request = createRequest({
      headers: { "X-Request-Id": "health-check-trace" },
    });
    const response = await GET(request);

    expect(response.headers.get("X-Request-Id")).toBe("health-check-trace");
  });

  it("generates X-Request-Id when not provided", async () => {
    const request = createRequest();
    const response = await GET(request);

    const traceId = response.headers.get("X-Request-Id");
    expect(traceId).toBeDefined();
    expect(traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("returns a valid ISO 8601 timestamp in the response body", async () => {
    const request = createRequest();
    const response = await GET(request);
    const body = await response.json();

    const timestamp = body.data.timestamp;
    expect(typeof timestamp).toBe("string");
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });
});
