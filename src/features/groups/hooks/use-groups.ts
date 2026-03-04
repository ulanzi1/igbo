"use client";

import { useQuery } from "@tanstack/react-query";
import type { GroupListItem } from "@/db/queries/groups";

interface UseGroupsParams {
  nameFilter?: string;
  cursor?: string;
  limit?: number;
}

interface GroupsResponse {
  groups: GroupListItem[];
  nextCursor: string | null;
  total: number;
}

async function fetchGroups(params: UseGroupsParams): Promise<GroupsResponse> {
  const url = new URL("/api/v1/groups", window.location.origin);
  if (params.nameFilter) url.searchParams.set("name", params.nameFilter);
  if (params.cursor) url.searchParams.set("cursor", params.cursor);
  if (params.limit) url.searchParams.set("limit", String(params.limit));

  const res = await fetch(url.toString(), { credentials: "include" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[useGroups] fetch failed: ${res.status} ${res.statusText}`, body);
    throw new Error(`Failed to fetch groups: ${res.status}`);
  }

  const json: unknown = await res.json();
  const data = json as { data: GroupsResponse };
  return data.data;
}

export function useGroups(params: UseGroupsParams = {}) {
  return useQuery({
    queryKey: ["groups", params.nameFilter ?? "", params.cursor ?? "", params.limit ?? 20],
    queryFn: () => fetchGroups(params),
  });
}
