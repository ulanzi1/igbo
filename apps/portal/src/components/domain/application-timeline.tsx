"use client";
import { useTranslations, useFormatter } from "next-intl";
import type { PortalApplicationTransition } from "@igbo/db/schema/portal-applications";

interface ApplicationTimelineProps {
  transitions: PortalApplicationTransition[];
}

export function ApplicationTimeline({ transitions }: ApplicationTimelineProps) {
  const t = useTranslations("Portal.applications");
  const format = useFormatter();

  const isLatest = (index: number) => index === transitions.length - 1;

  return (
    <ol aria-label={t("timelineTitle")} className="relative space-y-0">
      {transitions.map((transition, index) => {
        const latest = isLatest(index);
        return (
          <li
            key={transition.id}
            className="relative pl-8 pb-6"
            aria-current={latest ? "step" : undefined}
          >
            {/* Vertical connecting line (not shown for last item) */}
            {!latest && (
              <div
                className="absolute left-[11px] top-6 h-full w-0.5 bg-border"
                aria-hidden="true"
              />
            )}

            {/* Dot marker */}
            <div
              className={`absolute left-0 top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                latest ? "border-primary bg-primary" : "border-border bg-background"
              }`}
              aria-hidden="true"
            >
              <div
                className={`h-2 w-2 rounded-full ${latest ? "bg-primary-foreground" : "bg-muted-foreground"}`}
              />
            </div>

            {/* Content */}
            <div className={latest ? "font-semibold" : ""}>
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
