import { sql } from "drizzle-orm";
import { db } from "../index";
import { platformDismissedGroupRecommendations } from "../schema/platform-dismissed-recommendations";
import type { GroupVisibility, GroupJoinType } from "../schema/community-groups";

export interface RecommendedGroupItem {
  id: string;
  name: string;
  description: string | null;
  bannerUrl: string | null;
  visibility: GroupVisibility;
  joinType: GroupJoinType;
  memberCount: number;
  score: number;
}

interface RawRecommendedGroupRow {
  id: string;
  name: string;
  description: string | null;
  banner_url: string | null;
  visibility: string;
  join_type: string;
  member_count: string | number;
  score: string | number;
}

export async function getRecommendedGroups(
  userId: string,
  limit: number = 5,
): Promise<RecommendedGroupItem[]> {
  const rows = await db.execute(sql`
    SELECT
      g.id,
      g.name,
      g.description,
      g.banner_url,
      g.visibility,
      g.join_type,
      g.member_count,
      (
        -- Interest overlap: member profile interests appear in group name/description
        CASE WHEN EXISTS (
          SELECT 1 FROM community_profiles cp
          WHERE cp.user_id = ${userId}::uuid
            AND EXISTS (
              SELECT 1 FROM unnest(cp.interests) AS interest
              WHERE g.name ILIKE '%' || replace(replace(replace(interest, '\', '\\'), '%', '\%'), '_', '\_') || '%'
                 OR g.description ILIKE '%' || replace(replace(replace(interest, '\', '\\'), '%', '\%'), '_', '\_') || '%'
            )
        ) THEN 1 ELSE 0 END
        +
        -- Shared connections: a followed user is an active member
        CASE WHEN EXISTS (
          SELECT 1 FROM community_member_follows f
          JOIN community_group_members m ON m.user_id = f.following_id
          WHERE f.follower_id = ${userId}::uuid
            AND m.group_id = g.id
            AND m.status = 'active'
        ) THEN 1 ELSE 0 END
        +
        -- Geographic relevance: city or country in group description/name
        CASE WHEN EXISTS (
          SELECT 1 FROM community_profiles cp
          WHERE cp.user_id = ${userId}::uuid
            AND (
              (cp.location_city IS NOT NULL AND g.description ILIKE '%' || replace(replace(replace(cp.location_city, '\', '\\'), '%', '\%'), '_', '\_') || '%')
              OR (cp.location_country IS NOT NULL AND g.description ILIKE '%' || replace(replace(replace(cp.location_country, '\', '\\'), '%', '\%'), '_', '\_') || '%')
            )
        ) THEN 1 ELSE 0 END
        +
        -- Activity level: at least 5 members
        CASE WHEN g.member_count >= 5 THEN 1 ELSE 0 END
      ) AS score
    FROM community_groups g
    WHERE g.visibility != 'hidden'
      AND g.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM community_group_members m2
        WHERE m2.group_id = g.id
          AND m2.user_id = ${userId}::uuid
          AND m2.status IN ('active', 'pending')
      )
      AND NOT EXISTS (
        SELECT 1 FROM platform_dismissed_group_recommendations d
        WHERE d.user_id = ${userId}::uuid
          AND d.group_id = g.id
      )
    ORDER BY score DESC, g.member_count DESC, g.created_at DESC
    LIMIT ${limit}
  `);

  return (rows as unknown as Array<RawRecommendedGroupRow>).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    bannerUrl: r.banner_url,
    visibility: r.visibility as GroupVisibility,
    joinType: r.join_type as GroupJoinType,
    memberCount: Number(r.member_count),
    score: Number(r.score),
  }));
}

export async function dismissGroupRecommendation(userId: string, groupId: string): Promise<void> {
  await db
    .insert(platformDismissedGroupRecommendations)
    .values({ userId, groupId })
    .onConflictDoNothing();
}
