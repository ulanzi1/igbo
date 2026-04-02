"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AuthUser } from "@igbo/db/schema/auth-users";

interface ApplicationsResponse {
  data: AuthUser[];
  meta: { page: number; pageSize: number; total: number };
}

const adminKeys = {
  applications: (status?: string) => ["admin", "applications", status] as const,
};

async function handleResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.detail ?? body.title ?? "Request failed");
  }
  return body as T;
}

export function useApplications(status = "PENDING_APPROVAL") {
  return useQuery<ApplicationsResponse>({
    queryKey: adminKeys.applications(status),
    queryFn: () =>
      fetch(`/api/v1/admin/applications?status=${status}`).then((r) =>
        handleResponse<ApplicationsResponse>(r),
      ),
  });
}

export function useApproveApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/v1/admin/applications/${id}/approve`, { method: "POST" }).then((r) =>
        handleResponse(r),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.applications() }),
  });
}

export function useRequestInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, message }: { id: string; message: string }) =>
      fetch(`/api/v1/admin/applications/${id}/request-info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      }).then((r) => handleResponse(r)),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.applications() }),
  });
}

export function useRejectApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      fetch(`/api/v1/admin/applications/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }).then((r) => handleResponse(r)),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.applications() }),
  });
}

export function useUndoAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, undoFromStatus }: { id: string; undoFromStatus: string }) =>
      fetch(`/api/v1/admin/applications/${id}/action`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ undoFromStatus }),
      }).then((r) => handleResponse(r)),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.applications() }),
  });
}
