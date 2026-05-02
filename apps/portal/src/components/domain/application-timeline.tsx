"use client";
import { useTranslations, useFormatter } from "next-intl";
import { Eye } from "lucide-react";
import type { PortalApplicationTransition } from "@igbo/db/schema/portal-applications";

interface ViewedByEntry {
  companyName: string;
  viewedAt: string | Date;
}

interface ApplicationTimelineProps {
  transitions: PortalApplicationTransition[];
  viewedBy?: ViewedByEntry | null;
}

export function ApplicationTimeline({ transitions, viewedBy }: ApplicationTimelineProps) {
  const t = useTranslations("Portal.applications");
  const tViewed = useTranslations("Portal.viewed");
  const format = useFormatter();

  // Build a unified chronological list of timeline items
  type TimelineItem =
    | { kind: "transition"; transition: PortalApplicationTransition; sortKey: Date }
    | { kind: "viewed"; entry: ViewedByEntry; sortKey: Date };

  const items: TimelineItem[] = [
    ...transitions.map((tr) => ({
      kind: "transition" as const,
      transition: tr,
      sortKey: new Date(tr.createdAt),
    })),
    ...(viewedBy
      ? [
          {
            kind: "viewed" as const,
            entry: viewedBy,
            sortKey: new Date(viewedBy.viewedAt),
          },
        ]
      : []),
  ].sort((a, b) => a.sortKey.getTime() - b.sortKey.getTime());

  return (
    <ol aria-label={t("timelineTitle")} className="relative space-y-0">
      {items.map((item, index) => {
        const isLatest = index === items.length - 1;

        if (item.kind === "viewed") {
          return (
            <li
              key="viewed-by-employer"
              className="relative pl-8 pb-6"
              aria-label={tViewed("timelineAriaLabel")}
            >
              {!isLatest && (
                <div
                  className="absolute left-[11px] top-6 h-full w-0.5 bg-border"
                  aria-hidden="true"
                />
              )}
              {/* Amber dot with eye icon — visually distinct from status transitions */}
              <div
                className="absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-amber-400 bg-amber-50"
                aria-hidden="true"
              >
                <Eye className="h-3 w-3 text-amber-600" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {tViewed("timelineEntry", { companyName: item.entry.companyName })}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {format.dateTime(new Date(item.entry.viewedAt), {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </li>
          );
        }

        // kind === "transition"
        const { transition } = item;
        return (
          <li
            key={transition.id}
            className="relative pl-8 pb-6"
            aria-current={isLatest ? "step" : undefined}
          >
            {!isLatest && (
              <div
                className="absolute left-[11px] top-6 h-full w-0.5 bg-border"
                aria-hidden="true"
              />
            )}
            <div
              className={`absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                isLatest ? "border-primary bg-primary" : "border-border bg-background"
              }`}
              aria-hidden="true"
            >
              <div
                className={`h-2 w-2 rounded-full ${isLatest ? "bg-primary-foreground" : "bg-muted-foreground"}`}
              />
            </div>
            <div className={isLatest ? "font-semibold" : ""}>
              <p className="text-sm font-medium text-foreground">
                {transition.fromStatus === transition.toStatus && index === 0
                  ? t("timelineSubmitted")
                  : t("timelineTransition", {
                      fromStatus: t(`status.${transition.fromStatus}`),
                      toStatus: t(`status.${transition.toStatus}`),
                    })}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {format.dateTime(new Date(transition.createdAt), {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {transition.actorRole === "job_seeker"
                  ? t("timelineActorSeeker")
                  : transition.actorRole === "employer"
                    ? t("timelineActorEmployer")
                    : t("timelineActorAdmin")}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
