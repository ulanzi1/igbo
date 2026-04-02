/**
 * Cursor-based pagination utilities (Spike — Epic 2 prep).
 *
 * Cursor encodes { id, createdAt } — sufficient for stable ordering on any
 * table sorted by (created_at DESC, id DESC).
 *
 * Usage pattern (server-side query handler):
 *
 *   const cursor = parseCursorParam(searchParams.get("cursor"));
 *   const rows = await db
 *     .select()
 *     .from(table)
 *     .where(cursor
 *       ? or(
 *           lt(table.createdAt, new Date(cursor.createdAt)),
 *           and(eq(table.createdAt, new Date(cursor.createdAt)), lt(table.id, cursor.id))
 *         )
 *       : undefined)
 *     .orderBy(desc(table.createdAt), desc(table.id))
 *     .limit(limit + 1);          // fetch one extra to detect hasMore
 *   return buildCursorPage(rows, limit);
 */

export interface CursorData {
  id: string;
  createdAt: string; // ISO 8601
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** Encode a cursor to a URL-safe base64 string. */
export function encodeCursor(data: CursorData): string {
  return Buffer.from(JSON.stringify(data)).toString("base64url");
}

/**
 * Decode a cursor string.
 * Returns null on any parse/validation failure — callers treat null as "first page".
 */
export function decodeCursor(cursor: string): CursorData | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.id !== "string" || typeof obj.createdAt !== "string") return null;
    if (isNaN(Date.parse(obj.createdAt))) return null;
    return { id: obj.id, createdAt: obj.createdAt };
  } catch {
    return null;
  }
}

/**
 * Parse and validate a cursor query parameter.
 * Returns null if absent or invalid — treat as "first page".
 */
export function parseCursorParam(cursor: string | null | undefined): CursorData | null {
  if (!cursor) return null;
  return decodeCursor(cursor);
}

/**
 * Build a CursorPage<T> from a database result set.
 *
 * Always fetch (limit + 1) rows from the DB and pass them all here.
 * This function detects hasMore from the extra row and trims it.
 */
export function buildCursorPage<T extends { id: string; createdAt: Date }>(
  rows: T[],
  limit: number,
): CursorPage<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = items.at(-1);
  const nextCursor = lastItem
    ? encodeCursor({ id: lastItem.id, createdAt: lastItem.createdAt.toISOString() })
    : null;
  return { items, nextCursor, hasMore };
}
