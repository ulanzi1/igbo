"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DEFAULT_SEARCH_STATE,
  serializeSearchUrlParams,
  countActiveFilters,
} from "@/lib/search-url-params";
import type { JobSearchUrlState, PortalEmploymentTypeValue } from "@/lib/search-url-params";

type AlertFrequency = "instant" | "daily" | "off";

interface SavedSearch {
  id: string;
  name: string;
  searchParamsJson: Record<string, unknown>;
  alertFrequency: AlertFrequency;
  lastAlertedAt: string | null;
}

function searchParamsJsonToUrlState(json: Record<string, unknown>): JobSearchUrlState {
  const filters = (json["filters"] as Record<string, unknown> | undefined) ?? {};
  const cc = (filters["culturalContext"] as Record<string, unknown> | undefined) ?? {};

  return {
    ...DEFAULT_SEARCH_STATE,
    q: String(json["query"] ?? ""),
    location: (filters["location"] as string[] | undefined) ?? [],
    employmentType: ((filters["employmentType"] as string[] | undefined) ??
      []) as PortalEmploymentTypeValue[],
    industry: (filters["industry"] as string[] | undefined) ?? [],
    salaryMin: (filters["salaryMin"] as number | null | undefined) ?? null,
    salaryMax: (filters["salaryMax"] as number | null | undefined) ?? null,
    remote: (filters["remote"] as boolean | undefined) ?? false,
    culturalContextDiasporaFriendly: (cc["diasporaFriendly"] as boolean | undefined) ?? false,
    culturalContextIgboPreferred: (cc["igboPreferred"] as boolean | undefined) ?? false,
    culturalContextCommunityReferred: (cc["communityReferred"] as boolean | undefined) ?? false,
  };
}

function buildParamsSummary(
  json: Record<string, unknown>,
  t: ReturnType<typeof useTranslations<"Portal.savedSearch">>,
): string {
  const state = searchParamsJsonToUrlState(json);
  const hasQuery = state.q.trim().length > 0;
  const filterCount = countActiveFilters(state);

  if (hasQuery && filterCount > 0) return t("params", { query: state.q.trim(), filterCount });
  if (hasQuery) return t("paramsQueryOnly", { query: state.q.trim() });
  if (filterCount > 0) return t("paramsNoQuery", { filterCount });
  return t("paramsAll");
}

interface SavedSearchItemProps {
  search: SavedSearch;
  onRename: (id: string, name: string) => Promise<void>;
  onFrequencyChange: (id: string, freq: AlertFrequency) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onLoad: (search: SavedSearch) => void;
  t: ReturnType<typeof useTranslations<"Portal.savedSearch">>;
}

function SavedSearchItem({
  search,
  onRename,
  onFrequencyChange,
  onDelete,
  onLoad,
  t,
}: SavedSearchItemProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(search.name);

  const locale = useLocale();
  const lastAlerted = search.lastAlertedAt
    ? t("lastAlerted", { date: new Date(search.lastAlertedAt).toLocaleDateString(locale) })
    : t("neverAlerted");

  async function handleRenameSubmit() {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== search.name) {
      await onRename(search.id, trimmed);
    }
    setEditing(false);
  }

  return (
    <li
      className="flex flex-col gap-2 rounded-lg border p-4"
      data-testid={`saved-search-item-${search.id}`}
    >
      {/* Name row */}
      <div className="flex items-center gap-2">
        {editing ? (
          <Input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit();
              if (e.key === "Escape") {
                setEditName(search.name);
                setEditing(false);
              }
            }}
            autoFocus
            data-testid={`rename-input-${search.id}`}
            className="h-7 flex-1"
          />
        ) : (
          <span
            className="font-medium flex-1 cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={() => setEditing(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setEditing(true);
              }
            }}
            data-testid={`search-name-${search.id}`}
          >
            {search.name}
          </span>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditing(true)}
          data-testid={`rename-button-${search.id}`}
          aria-label={t("rename")}
        >
          {t("rename")}
        </Button>
      </div>

      {/* Params summary */}
      <p className="text-sm text-muted-foreground" data-testid={`params-summary-${search.id}`}>
        {buildParamsSummary(search.searchParamsJson, t)}
      </p>

      {/* Frequency + last alerted */}
      <div className="flex items-center gap-3 text-sm">
        <Select
          value={search.alertFrequency}
          onValueChange={(v) => onFrequencyChange(search.id, v as AlertFrequency)}
        >
          <SelectTrigger
            className="h-7 w-36"
            data-testid={`frequency-select-${search.id}`}
            aria-label={t("frequencyLabel")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="instant">{t("frequencyInstant")}</SelectItem>
            <SelectItem value="daily">{t("frequencyDaily")}</SelectItem>
            <SelectItem value="off">{t("frequencyOff")}</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-muted-foreground" data-testid={`last-alerted-${search.id}`}>
          {lastAlerted}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onLoad(search)}
          data-testid={`load-search-${search.id}`}
        >
          {t("loadSearch")}
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" data-testid={`delete-button-${search.id}`}>
              {t("delete")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("deleteConfirmDescription")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDelete(search.id)}
                data-testid={`confirm-delete-${search.id}`}
              >
                {t("delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </li>
  );
}

export function SavedSearchList() {
  const t = useTranslations("Portal.savedSearch");
  const router = useRouter();
  const locale = useLocale();
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSearches = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/saved-searches");
      if (res.ok) {
        const body = (await res.json()) as { data: { searches: SavedSearch[] } };
        setSearches(body.data.searches);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSearches();
  }, [fetchSearches]);

  async function handleRename(id: string, name: string) {
    try {
      const res = await fetch(`/api/v1/saved-searches/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setSearches((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
      } else {
        toast.error(t("errorSaving"));
      }
    } catch {
      toast.error(t("errorSaving"));
    }
  }

  async function handleFrequencyChange(id: string, alertFrequency: AlertFrequency) {
    try {
      const res = await fetch(`/api/v1/saved-searches/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertFrequency }),
      });
      if (res.ok) {
        setSearches((prev) => prev.map((s) => (s.id === id ? { ...s, alertFrequency } : s)));
      } else {
        toast.error(t("errorSaving"));
      }
    } catch {
      toast.error(t("errorSaving"));
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/v1/saved-searches/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSearches((prev) => prev.filter((s) => s.id !== id));
      toast.success(t("deleted"));
    }
  }

  function handleLoad(search: SavedSearch) {
    const state = searchParamsJsonToUrlState(search.searchParamsJson);
    const params = serializeSearchUrlParams(state);
    router.push(`/${locale}/search?${params.toString()}`);
  }

  if (loading) {
    return <div data-testid="saved-search-loading" aria-busy="true" />;
  }

  if (searches.length === 0) {
    return (
      <div className="text-center py-12" data-testid="saved-search-empty">
        <p className="font-medium text-lg">{t("empty")}</p>
        <p className="text-muted-foreground text-sm mt-1">{t("emptyDescription")}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-3" data-testid="saved-search-list" aria-label={t("heading")}>
      {searches.map((search) => (
        <SavedSearchItem
          key={search.id}
          search={search}
          onRename={handleRename}
          onFrequencyChange={handleFrequencyChange}
          onDelete={handleDelete}
          onLoad={handleLoad}
          t={t}
        />
      ))}
    </ul>
  );
}
