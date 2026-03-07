import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export type SearchSectionType =
  | "members"
  | "posts"
  | "articles"
  | "groups"
  | "events"
  | "documents";

export interface SearchResultItem {
  id: string;
  type: SearchSectionType;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  href: string;
  rank: number;
}

export interface SearchSection {
  type: SearchSectionType;
  items: SearchResultItem[];
  hasMore: boolean;
}

export interface GlobalSearchResult {
  sections: SearchSection[];
  pageInfo: {
    query: string;
    limit: number;
    hasNextPage: boolean;
    cursor: string | null;
  };
}

export interface GlobalSearchParams {
  query: string;
  type: "members" | "posts" | "articles" | "groups" | "events" | "documents" | "all";
  viewerUserId: string;
  limit?: number;
  cursor?: string;
}

type MemberRow = {
  id: string;
  display_name: string;
  photo_url: string | null;
  location_city: string | null;
  rank: string;
};

type PostRow = {
  id: string;
  content: string;
  author_name: string | null;
  rank: string;
};

type ArticleRow = {
  id: string;
  title: string;
  title_igbo: string | null;
  rank: string;
};

type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  rank: string;
};

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  rank: string;
};

const SECTION_LIMIT_BUFFER = 1; // fetch limit+1 to detect hasMore

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
          COALESCE(a.title_igbo, '') || ' ' ||
          COALESCE(a.content, '') || ' ' ||
          COALESCE(a.content_igbo, '')
        ),
        plainto_tsquery('english', ${query})
      )::text AS rank
    FROM community_articles a
    WHERE a.status = 'published'
      AND a.deleted_at IS NULL
      AND to_tsvector('english',
            COALESCE(a.title, '') || ' ' ||
            COALESCE(a.title_igbo, '') || ' ' ||
            COALESCE(a.content, '') || ' ' ||
            COALESCE(a.content_igbo, '')
          ) @@ plainto_tsquery('english', ${query})
    ORDER BY rank DESC, a.published_at DESC
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
    ORDER BY rank DESC, e.starts_at ASC
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

/**
 * Run a unified global search across all (or specific) content types.
 * Returns grouped sections with ranked results and hasMore indicators.
 */
export async function runGlobalSearch(params: GlobalSearchParams): Promise<GlobalSearchResult> {
  const { query, type, viewerUserId, limit = 5 } = params;

  const sectionTypes: SearchSectionType[] =
    type === "all"
      ? ["members", "posts", "articles", "groups", "events"]
      : [type as SearchSectionType];

  const sectionPromises = sectionTypes.map((t) => {
    // Documents search deferred until platform_governance_documents table ships (Epic 11)
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
      cursor: null, // cursor pagination reserved for filtered full-results page (Story 10.2)
    },
  };
}
