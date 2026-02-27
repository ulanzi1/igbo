"use server";

import { searchMembersByName } from "@/db/queries/community-profiles";

export type { MemberSearchResult } from "@/db/queries/community-profiles";

export async function searchMembers(
  query: string,
  excludeUserIds: string[],
): Promise<{ id: string; displayName: string; photoUrl: string | null }[]> {
  if (!query || query.trim().length < 2) return [];
  try {
    return await searchMembersByName(query.trim(), excludeUserIds, 10);
  } catch {
    return [];
  }
}
