"use client";

import { useQuery } from "@tanstack/react-query";
import type { GroupListItem, DirectoryGroupItem } from "@igbo/db/queries/groups";
import type { GroupMemberRole, GroupMemberStatus } from "@igbo/db/schema/community-groups";

interface UseGroupsParams {
  nameFilter?: string;
  cursor?: string;
  limit?: number;
  directory?: boolean;
}

interface GroupsResponse {
  groups: GroupListItem[];
  nextCursor: string | null;
  total: number;
}

interface DirectoryGroupsResponse {
  groups: DirectoryGroupItem[];
  nextCursor: string | null;
  total: number;
  memberships: Record<string, { role: GroupMemberRole; status: GroupMemberStatus }>;
}

async function fetchGroups(
  params: UseGroupsParams,
): Promise<GroupsResponse | DirectoryGroupsResponse> {
  const url = new URL("/api/v1/groups", window.location.origin);
  if (params.nameFilter) url.searchParams.set("name", params.nameFilter);
  if (params.cursor) url.searchParams.set("cursor", params.cursor);
  if (params.limit) url.searchParams.set("limit", String(params.limit));
  if (params.directory) url.searchParams.set("directory", "true");

  const res = await fetch(url.toString(), { credentials: "include" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[useGroups] fetch failed: ${res.status} ${res.statusText}`, body);
    throw new Error(`Failed to fetch groups: ${res.status}`);
  }

  const json: unknown = await res.json();
  const data = json as { data: GroupsResponse | DirectoryGroupsResponse };
  return data.data;
}

export function useGroups(params: UseGroupsParams = {}) {
  return useQuery({
    queryKey: [
      "groups",
      params.nameFilter ?? "",
      params.cursor ?? "",
      params.limit ?? 20,
      params.directory ?? false,
    ],
    queryFn: () => fetchGroups(params),
  });
}
