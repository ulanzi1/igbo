"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { GroupCard } from "./GroupCard";
import { useGroups } from "@/features/groups/hooks/use-groups";

interface GroupListProps {
  canCreateGroup?: boolean;
}

export function GroupList({ canCreateGroup = false }: GroupListProps) {
  const t = useTranslations("Groups");
  const [nameFilter, setNameFilter] = useState("");
  const [debouncedFilter, setDebouncedFilter] = useState("");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const { data, isLoading, isError } = useGroups({ nameFilter: debouncedFilter || undefined });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNameFilter(value);
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => setDebouncedFilter(value), 300);
  };

  return (
    <div className="space-y-4">
      {/* Search + Create */}
      <div className="flex gap-3">
        <input
          type="search"
          value={nameFilter}
          onChange={handleSearchChange}
          placeholder={t("searchPlaceholder")}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={t("searchPlaceholder")}
        />
        {canCreateGroup && (
          <Link
            href="/groups/new"
            className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t("createGroup")}
          </Link>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-lg bg-muted" aria-hidden="true" />
          ))}
        </div>
      )}

      {/* Error */}
      {isError && <p className="text-center text-sm text-destructive">{t("errors.fetchFailed")}</p>}

      {/* Groups grid */}
      {!isLoading && !isError && data && (
        <>
          {data.groups.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="text-muted-foreground">{t("noGroups")}</p>
              <p className="text-sm text-muted-foreground">{t("noGroupsHint")}</p>
              {canCreateGroup && (
                <Link
                  href="/groups/new"
                  className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {t("createGroup")}
                </Link>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.groups.map((group) => (
                <GroupCard key={group.id} group={group} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
