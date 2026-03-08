import "server-only";
import { sql } from "drizzle-orm";
import sanitizeHtml from "sanitize-html";
import { db } from "@/db";

export type SearchSectionType =
  | "members"
  | "posts"
  | "articles"
  | "groups"
  | "events"
  | "documents";

export type DateRange = "today" | "week" | "month" | "custom";
export type PostCategory = "discussion" | "event" | "announcement";
export type MembershipTier = "BASIC" | "PROFESSIONAL" | "TOP_TIER";

export interface SearchFilters {
  dateRange?: DateRange;
  dateFrom?: string;
  dateTo?: string;
  authorId?: string;
  category?: PostCategory;
  location?: string;
  membershipTier?: MembershipTier;
}

export interface SearchResultItem {
  id: string;
  type: SearchSectionType;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  href: string;
  rank: number;
  highlight?: string | null;
}

export interface SearchSection {
  type: SearchSectionType;
  items: SearchResultItem[];
  hasMore: boolean;
  nextCursor?: string | null;
}

export interface GlobalSearchResult {
  sections: SearchSection[];
  pageInfo: {
    query: string;
    limit: number;
    hasNextPage: boolean;
    cursor: string | null;
    nextCursor: string | null;
  };
}

export interface GlobalSearchParams {
  query: string;
  type: "members" | "posts" | "articles" | "groups" | "events" | "documents" | "all";
  viewerUserId: string;
  limit?: number;
  cursor?: string;
  filters?: SearchFilters;
}

// ── Cursor helpers ────────────────────────────────────────────────────────────

interface CursorData {
  rank: number;
  sortVal: string | number;
  id: string;
}

function encodeCursor(data: CursorData): string {
  return Buffer.from(JSON.stringify(data)).toString("base64");
}

function decodeCursor(cursor: string): CursorData | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8")) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const c = parsed as Record<string, unknown>;
    if (
      typeof c["rank"] !== "number" ||
      (typeof c["sortVal"] !== "string" && typeof c["sortVal"] !== "number") ||
      typeof c["id"] !== "string"
    ) {
      return null;
    }
    return {
      rank: c["rank"] as number,
      sortVal: c["sortVal"] as string | number,
      id: c["id"] as string,
    };
  } catch {
    return null;
  }
}

// ── Highlight sanitizer ───────────────────────────────────────────────────────

function sanitizeHighlight(raw: string | null): string | null {
  if (!raw) return null;
  return sanitizeHtml(raw, {
    allowedTags: ["mark"],
    allowedAttributes: {},
  });
}

const TS_HEADLINE_OPTIONS = sql.raw(
  `'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=30, MinWords=15'`,
);

// ── Row types ─────────────────────────────────────────────────────────────────

type MemberRow = {
  id: string;
  display_name: string;
  photo_url: string | null;
  location_city: string | null;
  membership_tier: string | null;
  bio: string | null;
  rank: string;
  highlight: string | null;
};

type PostRow = {
  id: string;
  content: string;
  author_name: string | null;
  category: string;
  created_at: string;
  like_count: string | number;
  comment_count: string | number;
  rank: string;
  highlight: string | null;
};

type ArticleRow = {
  id: string;
  title: string;
  title_igbo: string | null;
  cover_image_url: string | null;
  author_name: string | null;
  created_at: string;
  rank: string;
  highlight: string | null;
};

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
  visibility: string;
  join_type: string;
  rank: string;
  highlight: string | null;
};

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  rsvp_count: string | number;
  status: string;
  rank: string;
  highlight: string | null;
};

const SECTION_LIMIT_BUFFER = 1;

// ── Overview search functions (unchanged behavior) ────────────────────────────

async function searchMembers(
  query: string,
  limit: number,
  viewerUserId: string,
): Promise<SearchSection> {
  const fetchLimit = limit + SECTION_LIMIT_BUFFER;
  const rows = (await db.execute(sql`
    SELECT
      cp.user_id::text AS id,
      cp.display_name,
      cp.photo_url,
      cp.location_city,
      ts_rank(
        to_tsvector('english',
          COALESCE(cp.display_name, '') || ' ' ||
          COALESCE(cp.bio, '') || ' ' ||
          COALESCE(cp.location_city, '') || ' ' ||
          COALESCE(cp.location_state, '') || ' ' ||
          COALESCE(cp.location_country, '')
        ),
        plainto_tsquery('english', ${query})
      )::text AS rank
    FROM community_profiles cp
    WHERE cp.deleted_at IS NULL
      AND cp.profile_completed_at IS NOT NULL
      AND cp.user_id != ${viewerUserId}
      AND NOT EXISTS (
        SELECT 1 FROM platform_blocked_users b
        WHERE (b.blocker_user_id = ${viewerUserId} AND b.blocked_user_id = cp.user_id)
           OR (b.blocker_user_id = cp.user_id AND b.blocked_user_id = ${viewerUserId})
      )
      AND to_tsvector('english',
            COALESCE(cp.display_name, '') || ' ' ||
            COALESCE(cp.bio, '') || ' ' ||
            COALESCE(cp.location_city, '') || ' ' ||
            COALESCE(cp.location_state, '') || ' ' ||
            COALESCE(cp.location_country, '')
          ) @@ plainto_tsquery('english', ${query})
    ORDER BY rank DESC, cp.display_name ASC
    LIMIT ${fetchLimit}
  `)) as MemberRow[];

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((row) => ({
    id: row.id,
    type: "members" as const,
    title: row.display_name,
    subtitle: row.location_city ?? null,
    imageUrl: row.photo_url ?? null,
    href: `/profiles/${row.id}`,
    rank: parseFloat(row.rank),
  }));

  return { type: "members", items, hasMore };
}

async function searchPosts(query: string, limit: number): Promise<SearchSection> {
  const fetchLimit = limit + SECTION_LIMIT_BUFFER;
  const rows = (await db.execute(sql`
    SELECT
      p.id::text,
      p.content,
      cp.display_name AS author_name,
      ts_rank(
        to_tsvector('english', COALESCE(p.content, '')),
        plainto_tsquery('english', ${query})
      )::text AS rank
    FROM community_posts p
    LEFT JOIN community_profiles cp ON cp.user_id = p.author_id AND cp.deleted_at IS NULL
    WHERE p.status = 'active'
      AND p.deleted_at IS NULL
      AND to_tsvector('english', COALESCE(p.content, '')) @@ plainto_tsquery('english', ${query})
    ORDER BY rank DESC, p.created_at DESC
    LIMIT ${fetchLimit}
  `)) as PostRow[];

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((row) => ({
    id: row.id,
    type: "posts" as const,
    title: row.content.length > 100 ? row.content.slice(0, 100) + "…" : row.content,
    subtitle: row.author_name ?? null,
    imageUrl: null,
    href: `/feed?post=${row.id}`,
    rank: parseFloat(row.rank),
  }));

  return { type: "posts", items, hasMore };
}

async function searchArticles(query: string, limit: number): Promise<SearchSection> {
  const fetchLimit = limit + SECTION_LIMIT_BUFFER;
  const rows = (await db.execute(sql`
    SELECT
      a.id::text,
      a.title,
      a.title_igbo,
      ts_rank(
        to_tsvector('english',
          COALESCE(a.title, '') || ' ' ||
          COALESCE(a.title_igbo, '')
        ),
        plainto_tsquery('english', ${query})
      )::text AS rank
    FROM community_articles a
    WHERE a.status = 'published'
      AND a.deleted_at IS NULL
      AND to_tsvector('english',
            COALESCE(a.title, '') || ' ' ||
            COALESCE(a.title_igbo, '')
          ) @@ plainto_tsquery('english', ${query})
    ORDER BY rank DESC, a.created_at DESC
    LIMIT ${fetchLimit}
  `)) as ArticleRow[];

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((row) => ({
    id: row.id,
    type: "articles" as const,
    title: row.title,
    subtitle: row.title_igbo ?? null,
    imageUrl: null,
    href: `/articles/${row.id}`,
    rank: parseFloat(row.rank),
  }));

  return { type: "articles", items, hasMore };
}

async function searchGroups(query: string, limit: number): Promise<SearchSection> {
  const fetchLimit = limit + SECTION_LIMIT_BUFFER;
  const rows = (await db.execute(sql`
    SELECT
      g.id::text,
      g.name,
      g.description,
      ts_rank(
        to_tsvector('english',
          COALESCE(g.name, '') || ' ' ||
          COALESCE(g.description, '')
        ),
        plainto_tsquery('english', ${query})
      )::text AS rank
    FROM community_groups g
    WHERE g.visibility != 'hidden'
      AND g.deleted_at IS NULL
      AND to_tsvector('english',
            COALESCE(g.name, '') || ' ' ||
            COALESCE(g.description, '')
          ) @@ plainto_tsquery('english', ${query})
    ORDER BY rank DESC, g.member_count DESC
    LIMIT ${fetchLimit}
  `)) as GroupRow[];

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((row) => ({
    id: row.id,
    type: "groups" as const,
    title: row.name,
    subtitle: row.description
      ? row.description.length > 80
        ? row.description.slice(0, 80) + "…"
        : row.description
      : null,
    imageUrl: null,
    href: `/groups/${row.id}`,
    rank: parseFloat(row.rank),
  }));

  return { type: "groups", items, hasMore };
}

async function searchEvents(query: string, limit: number): Promise<SearchSection> {
  const fetchLimit = limit + SECTION_LIMIT_BUFFER;
  const rows = (await db.execute(sql`
    SELECT
      e.id::text,
      e.title,
      e.description,
      ts_rank(
        to_tsvector('english',
          COALESCE(e.title, '') || ' ' ||
          COALESCE(e.description, '')
        ),
        plainto_tsquery('english', ${query})
      )::text AS rank
    FROM community_events e
    WHERE e.status != 'cancelled'
      AND e.deleted_at IS NULL
      AND to_tsvector('english',
            COALESCE(e.title, '') || ' ' ||
            COALESCE(e.description, '')
          ) @@ plainto_tsquery('english', ${query})
    ORDER BY rank DESC, e.start_time ASC
    LIMIT ${fetchLimit}
  `)) as EventRow[];

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((row) => ({
    id: row.id,
    type: "events" as const,
    title: row.title,
    subtitle: row.description
      ? row.description.length > 80
        ? row.description.slice(0, 80) + "…"
        : row.description
      : null,
    imageUrl: null,
    href: `/events/${row.id}`,
    rank: parseFloat(row.rank),
  }));

  return { type: "events", items, hasMore };
}

// ── Filtered search functions (single type, cursor pagination, highlights) ────

async function searchMembersFiltered(
  query: string,
  limit: number,
  viewerUserId: string,
  filters: SearchFilters,
  cursor?: string,
): Promise<SearchSection> {
  const fetchLimit = limit + SECTION_LIMIT_BUFFER;
  const tsQuery = sql`plainto_tsquery('english', ${query})`;
  const cursorData = cursor ? decodeCursor(cursor) : null;

  // Date filter (members: cp.created_at)
  const dateFilter =
    filters.dateRange === "today"
      ? sql`AND cp.created_at >= NOW()::date`
      : filters.dateRange === "week"
        ? sql`AND cp.created_at >= NOW() - INTERVAL '7 days'`
        : filters.dateRange === "month"
          ? sql`AND cp.created_at >= NOW() - INTERVAL '30 days'`
          : filters.dateRange === "custom" && filters.dateFrom && filters.dateTo
            ? sql`AND cp.created_at >= ${filters.dateFrom}::timestamptz AND cp.created_at <= ${filters.dateTo}::timestamptz`
            : sql``;

  // Membership tier filter
  const tierFilter = filters.membershipTier
    ? sql`AND au.membership_tier = ${filters.membershipTier}`
    : sql``;

  // Location filter
  const locationFilter = filters.location
    ? sql`AND (
        cp.location_city ILIKE ${"%" + filters.location + "%"}
        OR cp.location_state ILIKE ${"%" + filters.location + "%"}
        OR cp.location_country ILIKE ${"%" + filters.location + "%"}
      )`
    : sql``;

  // Cursor seek predicate: rank DESC, display_name ASC, id ASC
  const cursorFilter = cursorData
    ? sql`AND (
        rank::numeric < ${cursorData.rank}
        OR (rank::numeric = ${cursorData.rank} AND cp.display_name > ${String(cursorData.sortVal)})
        OR (rank::numeric = ${cursorData.rank} AND cp.display_name = ${String(cursorData.sortVal)} AND cp.user_id::text > ${cursorData.id})
      )`
    : sql``;

  const rows = (await db.execute(sql`
    SELECT
      cp.user_id::text AS id,
      cp.display_name,
      cp.photo_url,
      cp.location_city,
      cp.bio,
      au.membership_tier,
      ts_rank(
        to_tsvector('english',
          COALESCE(cp.display_name, '') || ' ' ||
          COALESCE(cp.bio, '') || ' ' ||
          COALESCE(cp.location_city, '') || ' ' ||
          COALESCE(cp.location_state, '') || ' ' ||
          COALESCE(cp.location_country, '')
        ),
        ${tsQuery}
      )::text AS rank,
      ts_headline('english', COALESCE(cp.bio, cp.display_name, ''), ${tsQuery}, ${TS_HEADLINE_OPTIONS}) AS highlight
    FROM community_profiles cp
    JOIN auth_users au ON au.id = cp.user_id
    WHERE cp.deleted_at IS NULL
      AND cp.profile_completed_at IS NOT NULL
      AND cp.user_id != ${viewerUserId}
      AND NOT EXISTS (
        SELECT 1 FROM platform_blocked_users b
        WHERE (b.blocker_user_id = ${viewerUserId} AND b.blocked_user_id = cp.user_id)
           OR (b.blocker_user_id = cp.user_id AND b.blocked_user_id = ${viewerUserId})
      )
      AND to_tsvector('english',
            COALESCE(cp.display_name, '') || ' ' ||
            COALESCE(cp.bio, '') || ' ' ||
            COALESCE(cp.location_city, '') || ' ' ||
            COALESCE(cp.location_state, '') || ' ' ||
            COALESCE(cp.location_country, '')
          ) @@ ${tsQuery}
      ${dateFilter}
      ${tierFilter}
      ${locationFilter}
      ${cursorFilter}
    ORDER BY rank DESC, cp.display_name ASC, cp.user_id::text ASC
    LIMIT ${fetchLimit}
  `)) as MemberRow[];

  const hasMore = rows.length > limit;
  const slicedRows = rows.slice(0, limit);

  const lastRow = slicedRows[slicedRows.length - 1];
  const nextCursor =
    hasMore && lastRow
      ? encodeCursor({
          rank: parseFloat(lastRow.rank),
          sortVal: lastRow.display_name,
          id: lastRow.id,
        })
      : null;

  const items = slicedRows.map((row) => ({
    id: row.id,
    type: "members" as const,
    title: row.display_name,
    subtitle: row.location_city ?? null,
    imageUrl: row.photo_url ?? null,
    href: `/profiles/${row.id}`,
    rank: parseFloat(row.rank),
    highlight: sanitizeHighlight(row.highlight),
  }));

  return { type: "members", items, hasMore, nextCursor } as SearchSection;
}

async function searchPostsFiltered(
  query: string,
  limit: number,
  filters: SearchFilters,
  cursor?: string,
): Promise<SearchSection> {
  const fetchLimit = limit + SECTION_LIMIT_BUFFER;
  const tsQuery = sql`plainto_tsquery('english', ${query})`;
  const cursorData = cursor ? decodeCursor(cursor) : null;

  const dateFilter =
    filters.dateRange === "today"
      ? sql`AND p.created_at >= NOW()::date`
      : filters.dateRange === "week"
        ? sql`AND p.created_at >= NOW() - INTERVAL '7 days'`
        : filters.dateRange === "month"
          ? sql`AND p.created_at >= NOW() - INTERVAL '30 days'`
          : filters.dateRange === "custom" && filters.dateFrom && filters.dateTo
            ? sql`AND p.created_at >= ${filters.dateFrom}::timestamptz AND p.created_at <= ${filters.dateTo}::timestamptz`
            : sql``;

  const authorFilter = filters.authorId ? sql`AND p.author_id = ${filters.authorId}` : sql``;
  const categoryFilter = filters.category ? sql`AND p.category = ${filters.category}` : sql``;

  // Cursor seek predicate: rank DESC, created_at DESC, id ASC
  const cursorFilter = cursorData
    ? sql`AND (
        rank::numeric < ${cursorData.rank}
        OR (rank::numeric = ${cursorData.rank} AND p.created_at < ${String(cursorData.sortVal)}::timestamptz)
        OR (rank::numeric = ${cursorData.rank} AND p.created_at = ${String(cursorData.sortVal)}::timestamptz AND p.id::text > ${cursorData.id})
      )`
    : sql``;

  const rows = (await db.execute(sql`
    SELECT
      p.id::text,
      p.content,
      p.category,
      p.created_at::text,
      COALESCE(p.like_count, 0) AS like_count,
      COALESCE(p.comment_count, 0) AS comment_count,
      cp.display_name AS author_name,
      ts_rank(
        to_tsvector('english', COALESCE(p.content, '')),
        ${tsQuery}
      )::text AS rank,
      ts_headline('english', COALESCE(p.content, ''), ${tsQuery}, ${TS_HEADLINE_OPTIONS}) AS highlight
    FROM community_posts p
    LEFT JOIN community_profiles cp ON cp.user_id = p.author_id AND cp.deleted_at IS NULL
    WHERE p.status = 'active'
      AND p.deleted_at IS NULL
      AND to_tsvector('english', COALESCE(p.content, '')) @@ ${tsQuery}
      ${dateFilter}
      ${authorFilter}
      ${categoryFilter}
      ${cursorFilter}
    ORDER BY rank DESC, p.created_at DESC, p.id ASC
    LIMIT ${fetchLimit}
  `)) as PostRow[];

  const hasMore = rows.length > limit;
  const slicedRows = rows.slice(0, limit);
  const lastRow = slicedRows[slicedRows.length - 1];
  const nextCursor =
    hasMore && lastRow
      ? encodeCursor({
          rank: parseFloat(lastRow.rank),
          sortVal: lastRow.created_at,
          id: lastRow.id,
        })
      : null;

  const items = slicedRows.map((row) => ({
    id: row.id,
    type: "posts" as const,
    title: row.content.length > 100 ? row.content.slice(0, 100) + "…" : row.content,
    subtitle: row.author_name ?? null,
    imageUrl: null,
    href: `/feed?post=${row.id}`,
    rank: parseFloat(row.rank),
    highlight: sanitizeHighlight(row.highlight),
  }));

  return { type: "posts", items, hasMore, nextCursor };
}

async function searchArticlesFiltered(
  query: string,
  limit: number,
  filters: SearchFilters,
  cursor?: string,
): Promise<SearchSection> {
  const fetchLimit = limit + SECTION_LIMIT_BUFFER;
  const tsQuery = sql`plainto_tsquery('english', ${query})`;
  const cursorData = cursor ? decodeCursor(cursor) : null;

  const dateFilter =
    filters.dateRange === "today"
      ? sql`AND a.created_at >= NOW()::date`
      : filters.dateRange === "week"
        ? sql`AND a.created_at >= NOW() - INTERVAL '7 days'`
        : filters.dateRange === "month"
          ? sql`AND a.created_at >= NOW() - INTERVAL '30 days'`
          : filters.dateRange === "custom" && filters.dateFrom && filters.dateTo
            ? sql`AND a.created_at >= ${filters.dateFrom}::timestamptz AND a.created_at <= ${filters.dateTo}::timestamptz`
            : sql``;

  const authorFilter = filters.authorId ? sql`AND a.author_id = ${filters.authorId}` : sql``;

  // Cursor seek predicate: rank DESC, created_at DESC, id ASC
  const cursorFilter = cursorData
    ? sql`AND (
        rank::numeric < ${cursorData.rank}
        OR (rank::numeric = ${cursorData.rank} AND a.created_at < ${String(cursorData.sortVal)}::timestamptz)
        OR (rank::numeric = ${cursorData.rank} AND a.created_at = ${String(cursorData.sortVal)}::timestamptz AND a.id::text > ${cursorData.id})
      )`
    : sql``;

  const rows = (await db.execute(sql`
    SELECT
      a.id::text,
      a.title,
      a.title_igbo,
      a.cover_image_url,
      a.created_at::text,
      cp.display_name AS author_name,
      ts_rank(
        to_tsvector('english',
          COALESCE(a.title, '') || ' ' ||
          COALESCE(a.title_igbo, '')
        ),
        ${tsQuery}
      )::text AS rank,
      ts_headline('english', COALESCE(a.title, ''), ${tsQuery}, ${TS_HEADLINE_OPTIONS}) AS highlight
    FROM community_articles a
    LEFT JOIN community_profiles cp ON cp.user_id = a.author_id AND cp.deleted_at IS NULL
    WHERE a.status = 'published'
      AND a.deleted_at IS NULL
      AND to_tsvector('english',
            COALESCE(a.title, '') || ' ' ||
            COALESCE(a.title_igbo, '')
          ) @@ ${tsQuery}
      ${dateFilter}
      ${authorFilter}
      ${cursorFilter}
    ORDER BY rank DESC, a.created_at DESC, a.id ASC
    LIMIT ${fetchLimit}
  `)) as ArticleRow[];

  const hasMore = rows.length > limit;
  const slicedRows = rows.slice(0, limit);
  const lastRow = slicedRows[slicedRows.length - 1];
  const nextCursor =
    hasMore && lastRow
      ? encodeCursor({
          rank: parseFloat(lastRow.rank),
          sortVal: lastRow.created_at,
          id: lastRow.id,
        })
      : null;

  const items = slicedRows.map((row) => ({
    id: row.id,
    type: "articles" as const,
    title: row.title,
    subtitle: row.title_igbo ?? null,
    imageUrl: row.cover_image_url ?? null,
    href: `/articles/${row.id}`,
    rank: parseFloat(row.rank),
    highlight: sanitizeHighlight(row.highlight),
  }));

  return { type: "articles", items, hasMore, nextCursor };
}

async function searchGroupsFiltered(
  query: string,
  limit: number,
  filters: SearchFilters,
  cursor?: string,
): Promise<SearchSection> {
  const fetchLimit = limit + SECTION_LIMIT_BUFFER;
  const tsQuery = sql`plainto_tsquery('english', ${query})`;
  const cursorData = cursor ? decodeCursor(cursor) : null;

  const dateFilter =
    filters.dateRange === "today"
      ? sql`AND g.created_at >= NOW()::date`
      : filters.dateRange === "week"
        ? sql`AND g.created_at >= NOW() - INTERVAL '7 days'`
        : filters.dateRange === "month"
          ? sql`AND g.created_at >= NOW() - INTERVAL '30 days'`
          : filters.dateRange === "custom" && filters.dateFrom && filters.dateTo
            ? sql`AND g.created_at >= ${filters.dateFrom}::timestamptz AND g.created_at <= ${filters.dateTo}::timestamptz`
            : sql``;

  // Cursor seek predicate: rank DESC, member_count DESC, id ASC
  const cursorFilter = cursorData
    ? sql`AND (
        rank::numeric < ${cursorData.rank}
        OR (rank::numeric = ${cursorData.rank} AND g.member_count < ${Number(cursorData.sortVal)})
        OR (rank::numeric = ${cursorData.rank} AND g.member_count = ${Number(cursorData.sortVal)} AND g.id::text > ${cursorData.id})
      )`
    : sql``;

  const rows = (await db.execute(sql`
    SELECT
      g.id::text,
      g.name,
      g.description,
      g.member_count,
      g.visibility,
      g.join_type,
      ts_rank(
        to_tsvector('english',
          COALESCE(g.name, '') || ' ' ||
          COALESCE(g.description, '')
        ),
        ${tsQuery}
      )::text AS rank,
      ts_headline('english', COALESCE(g.description, g.name, ''), ${tsQuery}, ${TS_HEADLINE_OPTIONS}) AS highlight
    FROM community_groups g
    WHERE g.visibility != 'hidden'
      AND g.deleted_at IS NULL
      AND to_tsvector('english',
            COALESCE(g.name, '') || ' ' ||
            COALESCE(g.description, '')
          ) @@ ${tsQuery}
      ${dateFilter}
      ${cursorFilter}
    ORDER BY rank DESC, g.member_count DESC, g.id ASC
    LIMIT ${fetchLimit}
  `)) as GroupRow[];

  const hasMore = rows.length > limit;
  const slicedRows = rows.slice(0, limit);
  const lastRow = slicedRows[slicedRows.length - 1];
  const nextCursor =
    hasMore && lastRow
      ? encodeCursor({
          rank: parseFloat(lastRow.rank),
          sortVal: lastRow.member_count,
          id: lastRow.id,
        })
      : null;

  const items = slicedRows.map((row) => ({
    id: row.id,
    type: "groups" as const,
    title: row.name,
    subtitle: row.description
      ? row.description.length > 80
        ? row.description.slice(0, 80) + "…"
        : row.description
      : null,
    imageUrl: null,
    href: `/groups/${row.id}`,
    rank: parseFloat(row.rank),
    highlight: sanitizeHighlight(row.highlight),
  }));

  return { type: "groups", items, hasMore, nextCursor };
}

async function searchEventsFiltered(
  query: string,
  limit: number,
  filters: SearchFilters,
  cursor?: string,
): Promise<SearchSection> {
  const fetchLimit = limit + SECTION_LIMIT_BUFFER;
  const tsQuery = sql`plainto_tsquery('english', ${query})`;
  const cursorData = cursor ? decodeCursor(cursor) : null;

  // Events: date filter on start_time
  const dateFilter =
    filters.dateRange === "today"
      ? sql`AND e.start_time >= NOW()::date`
      : filters.dateRange === "week"
        ? sql`AND e.start_time >= NOW() - INTERVAL '7 days'`
        : filters.dateRange === "month"
          ? sql`AND e.start_time >= NOW() - INTERVAL '30 days'`
          : filters.dateRange === "custom" && filters.dateFrom && filters.dateTo
            ? sql`AND e.start_time >= ${filters.dateFrom}::timestamptz AND e.start_time <= ${filters.dateTo}::timestamptz`
            : sql``;

  // authorId maps to creator_id for events
  const authorFilter = filters.authorId ? sql`AND e.creator_id = ${filters.authorId}` : sql``;

  // Location filter
  const locationFilter = filters.location
    ? sql`AND e.location ILIKE ${"%" + filters.location + "%"}`
    : sql``;

  // Cursor seek predicate: rank DESC, start_time ASC, id ASC
  const cursorFilter = cursorData
    ? sql`AND (
        rank::numeric < ${cursorData.rank}
        OR (rank::numeric = ${cursorData.rank} AND e.start_time > ${String(cursorData.sortVal)}::timestamptz)
        OR (rank::numeric = ${cursorData.rank} AND e.start_time = ${String(cursorData.sortVal)}::timestamptz AND e.id::text > ${cursorData.id})
      )`
    : sql``;

  const rows = (await db.execute(sql`
    SELECT
      e.id::text,
      e.title,
      e.description,
      e.location,
      e.start_time::text,
      e.status,
      COALESCE((SELECT COUNT(*) FROM community_event_attendees a WHERE a.event_id = e.id AND a.status = 'registered'), 0) AS rsvp_count,
      ts_rank(
        to_tsvector('english',
          COALESCE(e.title, '') || ' ' ||
          COALESCE(e.description, '')
        ),
        ${tsQuery}
      )::text AS rank,
      ts_headline('english', COALESCE(e.title, ''), ${tsQuery}, ${TS_HEADLINE_OPTIONS}) AS highlight
    FROM community_events e
    WHERE e.status != 'cancelled'
      AND e.deleted_at IS NULL
      AND to_tsvector('english',
            COALESCE(e.title, '') || ' ' ||
            COALESCE(e.description, '')
          ) @@ ${tsQuery}
      ${dateFilter}
      ${authorFilter}
      ${locationFilter}
      ${cursorFilter}
    ORDER BY rank DESC, e.start_time ASC, e.id ASC
    LIMIT ${fetchLimit}
  `)) as EventRow[];

  const hasMore = rows.length > limit;
  const slicedRows = rows.slice(0, limit);
  const lastRow = slicedRows[slicedRows.length - 1];
  const nextCursor =
    hasMore && lastRow
      ? encodeCursor({
          rank: parseFloat(lastRow.rank),
          sortVal: lastRow.start_time,
          id: lastRow.id,
        })
      : null;

  const items = slicedRows.map((row) => ({
    id: row.id,
    type: "events" as const,
    title: row.title,
    subtitle: row.description
      ? row.description.length > 80
        ? row.description.slice(0, 80) + "…"
        : row.description
      : null,
    imageUrl: null,
    href: `/events/${row.id}`,
    rank: parseFloat(row.rank),
    highlight: sanitizeHighlight(row.highlight),
  }));

  return { type: "events", items, hasMore, nextCursor };
}

/**
 * Run a unified global search across all (or specific) content types.
 * Overview mode (type=all): grouped sections, no cursor, no filters.
 * Filtered mode (single type): cursor pagination, filters, highlights.
 */
export async function runGlobalSearch(params: GlobalSearchParams): Promise<GlobalSearchResult> {
  const { query, type, viewerUserId, limit = 5, cursor, filters } = params;

  const isFilteredMode = type !== "all" && type !== "documents";

  // Filtered mode: single type, cursor pagination, highlights
  if (isFilteredMode && filters !== undefined) {
    let sectionWithCursor: SearchSection;

    switch (type) {
      case "members":
        sectionWithCursor = await searchMembersFiltered(
          query,
          limit,
          viewerUserId,
          filters,
          cursor,
        );
        break;
      case "posts":
        sectionWithCursor = await searchPostsFiltered(query, limit, filters, cursor);
        break;
      case "articles":
        sectionWithCursor = await searchArticlesFiltered(query, limit, filters, cursor);
        break;
      case "groups":
        sectionWithCursor = await searchGroupsFiltered(query, limit, filters, cursor);
        break;
      case "events":
        sectionWithCursor = await searchEventsFiltered(query, limit, filters, cursor);
        break;
      default:
        sectionWithCursor = {
          type: type as SearchSectionType,
          items: [],
          hasMore: false,
          nextCursor: null,
        };
    }

    return {
      sections: [sectionWithCursor],
      pageInfo: {
        query,
        limit,
        hasNextPage: sectionWithCursor.hasMore,
        cursor: sectionWithCursor.nextCursor,
        nextCursor: sectionWithCursor.nextCursor,
      },
    };
  }

  // Overview mode (type=all) or single type without filters — original behavior
  const sectionTypes: SearchSectionType[] =
    type === "all"
      ? ["members", "posts", "articles", "groups", "events"]
      : [type as SearchSectionType];

  const sectionPromises = sectionTypes.map((t) => {
    if (t === "documents") {
      return Promise.resolve({
        type: "documents" as const,
        items: [],
        hasMore: false,
      } as SearchSection);
    }
    switch (t) {
      case "members":
        return searchMembers(query, limit, viewerUserId);
      case "posts":
        return searchPosts(query, limit);
      case "articles":
        return searchArticles(query, limit);
      case "groups":
        return searchGroups(query, limit);
      case "events":
        return searchEvents(query, limit);
      default:
        return Promise.resolve({ type: t, items: [], hasMore: false } as SearchSection);
    }
  });

  const sections = await Promise.all(sectionPromises);
  const hasNextPage = sections.some((s) => s.hasMore);

  return {
    sections,
    pageInfo: {
      query,
      limit,
      hasNextPage,
      cursor: null,
      nextCursor: null, // cursor pagination reserved for filtered full-results page
    },
  };
}
