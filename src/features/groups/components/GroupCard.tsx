"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { GroupListItem } from "@/db/queries/groups";

interface GroupCardProps {
  group: GroupListItem;
}

export function GroupCard({ group }: GroupCardProps) {
  const t = useTranslations("Groups");

  const visibilityKey = group.visibility as "public" | "private" | "hidden";

  return (
    <article
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
      data-testid="group-card"
    >
      <Link
        href={`/groups/${group.id}`}
        className="flex flex-1 flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {/* Banner */}
        <div className="relative h-32 w-full overflow-hidden bg-muted">
          {group.bannerUrl ? (
            <img src={group.bannerUrl} alt={group.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
              <span className="text-2xl font-bold text-primary/40">
                {group.name.charAt(0).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col gap-1 p-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-1 font-semibold text-foreground">{group.name}</h3>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {t(`visibilityOptions.${visibilityKey}`)}
            </span>
          </div>

          {group.description && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{group.description}</p>
          )}

          <div className="mt-auto flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              {t("members", { count: group.memberCount })}
            </span>
            {/* Join button is a placeholder — fully implemented in Story 5.2 */}
            <span
              className="rounded-md bg-primary/10 px-3 py-1 text-xs font-medium text-primary opacity-50"
              aria-hidden="true"
            >
              {t("joinButton")}
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}
