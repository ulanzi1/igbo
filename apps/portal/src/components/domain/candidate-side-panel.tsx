"use client";

import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  TrustSignalsPanel,
  TrustSignalsPanelSkeleton,
} from "@/components/semantic/trust-signals-panel";
import { ApplicationTimeline } from "@/components/domain/application-timeline";
import type { SeekerTrustSignals } from "@igbo/db/queries/cross-app";
import type { PortalApplicationTransition } from "@igbo/db/schema/portal-applications";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApplicationDetail {
  id: string;
  seekerName: string;
  seekerHeadline: string | null;
  seekerSkills: string[];
  seekerSummary: string | null;
  coverLetterText: string | null;
  portfolioLinksJson: string[];
  cvLabel: string | null;
  cvProcessedUrl: string | null;
}

interface PanelData {
  application: ApplicationDetail;
  trustSignals: SeekerTrustSignals;
  transitions: PortalApplicationTransition[];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CandidateSidePanelProps {
  applicationId: string | null;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CandidateSidePanel({ applicationId, onClose }: CandidateSidePanelProps) {
  const t = useTranslations("Portal.ats");
  const [data, setData] = useState<PanelData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!applicationId) {
      setData(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setData(null);

    fetch(`/api/v1/applications/${applicationId}/detail`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) {
          setData(json.data as PanelData);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  return (
    <Sheet
      open={applicationId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        className="w-full overflow-y-auto sm:max-w-lg"
        aria-label={t("ariaSidePanel")}
        data-testid="candidate-side-panel"
      >
        <SheetHeader>
          <SheetTitle>{t("sidePanel.title")}</SheetTitle>
          <SheetDescription className="sr-only">{t("ariaSidePanel")}</SheetDescription>
        </SheetHeader>

        {loading && <PanelSkeleton />}

        {!loading && data && (
          <div className="mt-4 flex flex-col gap-6" data-testid="panel-content">
            {/* Profile */}
            <section aria-labelledby="panel-profile-heading">
              <h3 id="panel-profile-heading" className="mb-2 font-semibold">
                {t("sidePanel.profile")}
              </h3>
              <p className="font-medium">{data.application.seekerName}</p>
              {data.application.seekerHeadline && (
                <p className="text-sm text-muted-foreground">{data.application.seekerHeadline}</p>
              )}
              {data.application.seekerSkills.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1" aria-label={t("sidePanel.skills")}>
                  {data.application.seekerSkills.map((skill) => (
                    <Badge key={skill} variant="secondary" className="text-xs">
                      {skill}
                    </Badge>
                  ))}
                </div>
              )}
              {data.application.seekerSummary && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {data.application.seekerSummary}
                </p>
              )}
            </section>

            <Separator />

            {/* Community Trust */}
            <section aria-labelledby="panel-trust-heading">
              <h3 id="panel-trust-heading" className="mb-2 font-semibold">
                {t("sidePanel.trustSignals")}
              </h3>
              <TrustSignalsPanel signals={data.trustSignals} />
            </section>

            <Separator />

            {/* Cover Letter */}
            <section aria-labelledby="panel-cover-heading">
              <h3 id="panel-cover-heading" className="mb-2 font-semibold">
                {t("sidePanel.coverLetter")}
              </h3>
              {data.application.coverLetterText ? (
                <p className="whitespace-pre-wrap text-sm">{data.application.coverLetterText}</p>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noCoverLetter")}</p>
              )}
            </section>

            <Separator />

            {/* Resume */}
            <section aria-labelledby="panel-cv-heading">
              <h3 id="panel-cv-heading" className="mb-2 font-semibold">
                {t("sidePanel.cv")}
              </h3>
              {data.application.cvProcessedUrl ? (
                <a
                  href={data.application.cvProcessedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary underline-offset-4 hover:underline"
                  data-testid="cv-download-link"
                >
                  {t("sidePanel.downloadCv")}
                  {data.application.cvLabel ? ` — ${data.application.cvLabel}` : ""}
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">{t("sidePanel.noCv")}</p>
              )}
            </section>

            <Separator />

            {/* Portfolio */}
            <section aria-labelledby="panel-portfolio-heading">
              <h3 id="panel-portfolio-heading" className="mb-2 font-semibold">
                {t("sidePanel.portfolioLinks")}
              </h3>
              {data.application.portfolioLinksJson.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {data.application.portfolioLinksJson.map((link, i) => (
                    <li key={i}>
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary underline-offset-4 hover:underline"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("sidePanel.noPortfolio")}</p>
              )}
            </section>

            <Separator />

            {/* Timeline */}
            <section aria-labelledby="panel-timeline-heading">
              <h3 id="panel-timeline-heading" className="mb-2 font-semibold">
                {t("sidePanel.timeline")}
              </h3>
              <ApplicationTimeline transitions={data.transitions} />
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function PanelSkeleton() {
  return (
    <div className="mt-4 flex flex-col gap-6" data-testid="panel-skeleton">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Separator />
      <TrustSignalsPanelSkeleton />
      <Separator />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
