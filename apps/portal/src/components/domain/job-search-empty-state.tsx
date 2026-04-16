"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

interface JobSearchEmptyStateProps {
  variant: "filtered" | "cold-start";
  onClearFilters?: () => void;
}

/**
 * Empty state component with two tone variants:
 *   - "filtered":   Practical tone — no results under current filters/query.
 *   - "cold-start": Optimistic tone — no query or filters, cold-start signal.
 *
 * Per UX spec §2692–2695: tone must match context. Never show "optimistic"
 * tone when the user has active filters — that misrepresents the situation.
 */
export function JobSearchEmptyState({ variant, onClearFilters }: JobSearchEmptyStateProps) {
  const t = useTranslations("Portal.search");

  if (variant === "filtered") {
    return (
      <section
        role="status"
        aria-label={t("empty.filtered.title")}
        data-testid="empty-state-filtered"
        className="flex flex-col items-center justify-center py-16 text-center gap-4"
      >
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">{t("empty.filtered.title")}</h2>
          <p className="text-sm text-muted-foreground max-w-xs">{t("empty.filtered.body")}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          {onClearFilters && (
            <Button onClick={onClearFilters} size="sm" data-testid="clear-filters-cta">
              {t("empty.filtered.clearFilters")}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClearFilters} data-testid="browse-all-cta">
            {t("empty.filtered.browseAll")}
          </Button>
        </div>
      </section>
    );
  }

  // Cold-start
  return (
    <section
      role="status"
      aria-label={t("empty.coldStart.title")}
      data-testid="empty-state-cold-start"
      className="flex flex-col items-center justify-center py-16 text-center gap-4"
    >
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t("empty.coldStart.title")}</h2>
        <p className="text-sm text-muted-foreground max-w-xs">{t("empty.coldStart.body")}</p>
      </div>
    </section>
  );
}
