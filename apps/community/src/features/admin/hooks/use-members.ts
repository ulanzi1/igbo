"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type MembershipTier = "BASIC" | "PROFESSIONAL" | "TOP_TIER";

export interface AdminMember {
  id: string;
  email: string;
  name: string | null;
  displayName: string | null;
  membershipTier: MembershipTier;
  role: string;
  accountStatus: string;
  createdAt: string;
}

interface MembersResponse {
  data: AdminMember[];
  meta: { page: number; pageSize: number; total: number };
}

const memberKeys = {
  members: (tier?: string, search?: string, page?: number) =>
    ["admin", "members", tier, search, page] as const,
};

async function handleResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.detail ?? body.title ?? "Request failed");
  }
  return body as T;
}

export function useMembers(tier?: string, search?: string, page = 1) {
  const params = new URLSearchParams({ page: String(page), pageSize: "20" });
  if (tier) params.set("tier", tier);
  if (search) params.set("search", search);

  return useQuery<MembersResponse>({
    queryKey: memberKeys.members(tier, search, page),
    queryFn: () =>
      fetch(`/api/v1/admin/members?${params.toString()}`).then((r) =>
        handleResponse<MembersResponse>(r),
      ),
  });
}

export function useChangeMemberTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tier }: { id: string; tier: MembershipTier }) =>
      fetch(`/api/v1/admin/members/${id}/tier`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      }).then((r) => handleResponse(r)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "members"] }),
  });
}
