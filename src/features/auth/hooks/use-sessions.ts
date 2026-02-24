"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SessionInfo } from "@/features/auth/types/auth";

async function fetchSessions(): Promise<SessionInfo[]> {
  const res = await fetch("/api/v1/sessions", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load sessions");
  const json = (await res.json()) as { data: SessionInfo[] };
  return json.data;
}

async function revokeSession(sessionId: string): Promise<void> {
  const res = await fetch(`/api/v1/sessions/${sessionId}`, {
    method: "DELETE",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error("Failed to revoke session");
}

export function useSessions() {
  return useQuery<SessionInfo[]>({
    queryKey: ["sessions"],
    queryFn: fetchSessions,
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeSession,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}
