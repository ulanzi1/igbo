// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  encodeCursor,
  decodeCursor,
  parseCursorParam,
  buildCursorPage,
  type CursorData,
} from "./cursor-pagination";

// ─── encodeCursor / decodeCursor ─────────────────────────────────────────────

describe("encodeCursor", () => {
  it("returns a non-empty base64url string", () => {
    const encoded = encodeCursor({ id: "abc", createdAt: "2026-01-01T00:00:00.000Z" });
    expect(typeof encoded).toBe("string");
    expect(encoded.length).toBeGreaterThan(0);
    // base64url uses only URL-safe chars
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+=*$/);
  });

  it("round-trips through decodeCursor", () => {
    const data: CursorData = { id: "msg-42", createdAt: "2026-06-15T12:30:00.000Z" };
    const encoded = encodeCursor(data);
    const decoded = decodeCursor(encoded);
    expect(decoded).toEqual(data);
  });

  it("produces different cursors for different inputs", () => {
    const a = encodeCursor({ id: "1", createdAt: "2026-01-01T00:00:00.000Z" });
    const b = encodeCursor({ id: "2", createdAt: "2026-01-01T00:00:00.000Z" });
    expect(a).not.toBe(b);
  });
});

describe("decodeCursor", () => {
  it("returns null for an empty string", () => {
    expect(decodeCursor("")).toBeNull();
  });

  it("returns null for random garbage", () => {
    expect(decodeCursor("not-a-cursor!!")).toBeNull();
  });

  it("returns null when id field is missing", () => {
    const bad = Buffer.from(JSON.stringify({ createdAt: "2026-01-01T00:00:00.000Z" })).toString(
      "base64url",
    );
    expect(decodeCursor(bad)).toBeNull();
  });

  it("returns null when createdAt field is missing", () => {
    const bad = Buffer.from(JSON.stringify({ id: "abc" })).toString("base64url");
    expect(decodeCursor(bad)).toBeNull();
  });

  it("returns null when createdAt is not a valid date string", () => {
    const bad = Buffer.from(JSON.stringify({ id: "abc", createdAt: "not-a-date" })).toString(
      "base64url",
    );
    expect(decodeCursor(bad)).toBeNull();
  });

  it("returns null when JSON is a primitive", () => {
    const bad = Buffer.from(JSON.stringify(42)).toString("base64url");
    expect(decodeCursor(bad)).toBeNull();
  });

  it("returns null when JSON is an array", () => {
    const bad = Buffer.from(JSON.stringify([])).toString("base64url");
    expect(decodeCursor(bad)).toBeNull();
  });
});

// ─── parseCursorParam ────────────────────────────────────────────────────────

describe("parseCursorParam", () => {
  it("returns null for null input", () => {
    expect(parseCursorParam(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(parseCursorParam(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseCursorParam("")).toBeNull();
  });

  it("returns decoded cursor for a valid encoded string", () => {
    const data: CursorData = { id: "msg-1", createdAt: "2026-03-01T10:00:00.000Z" };
    const encoded = encodeCursor(data);
    expect(parseCursorParam(encoded)).toEqual(data);
  });

  it("returns null for an invalid encoded string", () => {
    expect(parseCursorParam("invalid-garbage")).toBeNull();
  });
});

// ─── buildCursorPage ─────────────────────────────────────────────────────────

describe("buildCursorPage", () => {
  function makeRows(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      id: `msg-${i + 1}`,
      createdAt: new Date(`2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`),
      body: `Message ${i + 1}`,
    }));
  }

  it("returns all items when fewer than limit", () => {
    const rows = makeRows(3);
    const page = buildCursorPage(rows, 10);
    expect(page.items).toHaveLength(3);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).not.toBeNull();
  });

  it("returns exactly limit items when rows.length === limit + 1", () => {
    const rows = makeRows(11); // limit = 10, extra row to detect hasMore
    const page = buildCursorPage(rows, 10);
    expect(page.items).toHaveLength(10);
    expect(page.hasMore).toBe(true);
  });

  it("sets nextCursor to null when items is empty", () => {
    const page = buildCursorPage([], 10);
    expect(page.items).toHaveLength(0);
    expect(page.nextCursor).toBeNull();
    expect(page.hasMore).toBe(false);
  });

  it("nextCursor decodes to last item's id and createdAt", () => {
    const rows = makeRows(5);
    const page = buildCursorPage(rows, 5);
    const decoded = decodeCursor(page.nextCursor!);
    expect(decoded?.id).toBe("msg-5");
    expect(decoded?.createdAt).toBe(rows[4]!.createdAt.toISOString());
  });

  it("trims extra row and sets hasMore=true", () => {
    const rows = makeRows(6);
    const page = buildCursorPage(rows, 5);
    expect(page.items).toHaveLength(5);
    expect(page.hasMore).toBe(true);
    // last item in page should be msg-5, not msg-6
    expect(page.items.at(-1)?.id).toBe("msg-5");
  });

  it("nextCursor is a valid base64url string", () => {
    const rows = makeRows(3);
    const page = buildCursorPage(rows, 10);
    expect(page.nextCursor).toMatch(/^[A-Za-z0-9_-]+=*$/);
  });
});
