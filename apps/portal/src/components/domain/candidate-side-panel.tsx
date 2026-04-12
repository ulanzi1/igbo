"use client";

import React, { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, ExternalLink } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TrustSignalsPanel } from "@/components/semantic/trust-signals-panel";
import { ApplicationTimeline } from "@/components/domain/application-timeline";
import { NotesSection } from "@/components/domain/notes-section";
import type { PortalApplicationStatus } from "@igbo/db/schema/portal-applications";
import type { PortalApplicationTransition } from "@igbo/db/schema/portal-applications";
import type { SeekerTrustSignals } from "@igbo/db/queries/cross-app";
import type { ApplicationNote } from "@igbo/db/queries/portal-application-notes";

/** Returns true only for http/https URLs — blocks javascript: and data: protocol XSS. */
function isSafeUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export interface CandidateDetailResponse {
  application: {
    id: string;
    jobId: string;
    seekerUserId: string;
    status: PortalApplicationStatus;
    createdAt: string | Date;
    updatedAt: string | Date;
    coverLetterText: string | null;
    portfolioLinksJson: string[];
    selectedCvId: string | null;
    jobTitle: string | null;
    seekerName: string | null;
    seekerHeadline: string | null;
    seekerProfileId: string | null;
    seekerSummary: string | null;
    seekerSkills: string[];
    cvId: string | null;
    cvLabel: string | null;
    cvProcessedUrl: string | null;
  };
  trustSignals: SeekerTrustSignals | null;
  transitions: PortalApplicationTransition[];
  notes: ApplicationNote[];
}

export interface CandidateSidePanelProps {
  applicationId: string | null;
  onClose: () => void;
}

/**
 * Candidate detail side panel (Sheet).
 * Fetches `GET /api/v1/applications/[id]/detail` when applicationId is non-null,
 * and renders Profile / Community Trust / Cover Letter / Resume / Portfolio / Timeline sections.
 */
export function CandidateSidePanel({ applicationId, onClose }: CandidateSidePanelProps) {
  const t = useTranslations("Portal.ats");
  const [data, setData] = useState<CandidateDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!applicationId) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetch(`/api/v1/applications/${applicationId}/detail`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed: ${res.status}`);
        }
        const json = (await res.json()) as { data: CandidateDetailResponse };
        if (!cancelled) {
          setData(json.data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(t("sidePanel.loadError"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [applicationId, t]);

  const isOpen = applicationId !== null;

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg"
        aria-label={t("ariaSidePanel")}
        data-testid="candidate-side-panel"
      >
        <SheetHeader>
          <SheetTitle>{t("sidePanel.title")}</SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-5rem)] px-4">
          {isLoading ? <LoadingSkeleton /> : null}

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          {!isLoading && !error && data ? <PanelContent data={data} /> : null}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function LoadingSkeleton() {
  const t = useTranslations("Portal.ats");
  return (
    <div className="flex flex-col gap-4 py-4" aria-label={t("sidePanel.loading")}>
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function PanelContent({ data }: { data: CandidateDetailResponse }) {
  const t = useTranslations("Portal.ats");
  const { application, trustSignals, transitions, notes } = data;

  return (
    <div className="flex flex-col gap-6 py-4">
      {/* Profile */}
      <section aria-labelledby="csp-profile-heading">
        <h3 id="csp-profile-heading" className="mb-2 text-sm font-semibold">
          {t("sidePanel.profile")}
        </h3>
        <p className="text-base font-medium">{application.seekerName ?? "—"}</p>
        {application.seekerHeadline ? (
          <p className="text-sm text-muted-foreground">{application.seekerHeadline}</p>
        ) : null}
        {application.seekerSummary ? (
          <p className="mt-2 text-sm">{application.seekerSummary}</p>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground italic">{t("sidePanel.noSummary")}</p>
        )}
        <div className="mt-3">
          <h4 className="mb-1 text-xs font-semibold text-muted-foreground">
            {t("sidePanel.skills")}
          </h4>
          {application.seekerSkills.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {application.seekerSkills.map((skill) => (
                <Badge key={skill} variant="secondary" className="text-xs">
                  {skill}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("sidePanel.noSkills")}</p>
          )}
        </div>
      </section>

      {/* Community Trust */}
      {trustSignals ? <TrustSignalsPanel signals={trustSignals} /> : null}

      {/* Cover Letter */}
      <section aria-labelledby="csp-cover-heading">
        <h3 id="csp-cover-heading" className="mb-2 text-sm font-semibold">
          {t("sidePanel.coverLetter")}
        </h3>
        {application.coverLetterText ? (
          <p className="whitespace-pre-wrap text-sm">{application.coverLetterText}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">{t("noCoverLetter")}</p>
        )}
      </section>

      {/* Resume */}
      <section aria-labelledby="csp-cv-heading">
        <h3 id="csp-cv-heading" className="mb-2 text-sm font-semibold">
          {t("sidePanel.cv")}
        </h3>
        {application.cvProcessedUrl ? (
          <a
            href={application.cvProcessedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <Download className="size-4" aria-hidden="true" />
            {application.cvLabel ?? t("sidePanel.downloadCv")}
          </a>
        ) : (
          <p className="text-sm text-muted-foreground italic">{t("sidePanel.noCv")}</p>
        )}
      </section>

      {/* Portfolio */}
      <section aria-labelledby="csp-portfolio-heading">
        <h3 id="csp-portfolio-heading" className="mb-2 text-sm font-semibold">
          {t("sidePanel.portfolioLinks")}
        </h3>
        {application.portfolioLinksJson.filter(isSafeUrl).length > 0 ? (
          <ul className="flex flex-col gap-1">
            {application.portfolioLinksJson.filter(isSafeUrl).map((link) => (
              <li key={link}>
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline break-all"
                >
                  <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                  {link}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground italic">{t("sidePanel.noPortfolio")}</p>
        )}
      </section>

      {/* Timeline */}
      <section aria-labelledby="csp-timeline-heading">
        <h3 id="csp-timeline-heading" className="mb-2 text-sm font-semibold">
          {t("sidePanel.timeline")}
        </h3>
        {transitions.length > 0 ? (
          <ApplicationTimeline transitions={transitions} />
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </section>

      {/* Notes (P-2.10) */}
      <NotesSection applicationId={application.id} initialNotes={notes} />
    </div>
  );
}
