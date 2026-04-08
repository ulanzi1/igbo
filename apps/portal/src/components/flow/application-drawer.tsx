"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CvOption } from "@/components/domain/apply-button";

const MAX_PORTFOLIO_LINKS = 3;
const MAX_COVER_LETTER_CHARS = 2000;

export interface ApplicationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobTitle: string;
  companyName: string;
  cvs: CvOption[];
  cvsLoading: boolean;
  profileHeadline: string | null;
  profileSkills: string[];
  profileLocation: string | null;
  enableCoverLetter: boolean;
  onSuccess: () => void;
}

export function ApplicationDrawer({
  open,
  onOpenChange,
  jobId,
  jobTitle,
  companyName,
  cvs,
  cvsLoading,
  profileHeadline,
  profileSkills,
  profileLocation,
  enableCoverLetter,
  onSuccess,
}: ApplicationDrawerProps) {
  const t = useTranslations("Portal.apply");

  const [selectedCvId, setSelectedCvId] = useState<string | null>(null);
  const [coverLetterText, setCoverLetterText] = useState("");

  // Sync selectedCvId when CVs load asynchronously (H-1 fix)
  useEffect(() => {
    if (cvs.length === 0) return;
    const defaultCv = cvs.find((cv) => cv.isDefault) ?? cvs[0];
    if (defaultCv) setSelectedCvId(defaultCv.id);
  }, [cvs]);
  const [portfolioLinks, setPortfolioLinks] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const hasCvs = !cvsLoading && cvs.length > 0;
  const activeLinks = portfolioLinks.filter((l) => l.trim() !== "");

  function handleAddLink() {
    if (portfolioLinks.length < MAX_PORTFOLIO_LINKS) {
      setPortfolioLinks((prev) => [...prev, ""]);
    }
  }

  function handleRemoveLink(index: number) {
    setPortfolioLinks((prev) => prev.filter((_, i) => i !== index));
  }

  function handleLinkChange(index: number, value: string) {
    setPortfolioLinks((prev) => prev.map((l, i) => (i === index ? value : l)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side validation
    const validLinks = activeLinks.filter((l) => {
      try {
        new URL(l);
        return true;
      } catch {
        return false;
      }
    });
    if (activeLinks.length !== validLinks.length) {
      setError(t("errors.invalidPortfolioUrl"));
      return;
    }
    if (activeLinks.length > MAX_PORTFOLIO_LINKS) {
      setError(t("errors.tooManyPortfolioLinks"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          selectedCvId: hasCvs ? selectedCvId : null,
          coverLetterText: enableCoverLetter && coverLetterText ? coverLetterText : undefined,
          portfolioLinks: validLinks,
        }),
      });

      if (res.ok) {
        onSuccess();
        onOpenChange(false);
      } else {
        const data = (await res.json()) as {
          extensions?: { code?: string; reason?: string; jobStatus?: string };
          title?: string;
        };
        const code = data.extensions?.code ?? "";
        if (code === "PORTAL_ERRORS.DUPLICATE_APPLICATION") {
          setError(t("errors.duplicate"));
        } else if (code === "PORTAL_ERRORS.APPROVAL_INTEGRITY_VIOLATION") {
          const reason = data.extensions?.reason;
          const jobStatus = data.extensions?.jobStatus;
          if (reason === "deadline_passed") {
            setError(t("errors.deadlinePassed"));
          } else if (jobStatus === "filled") {
            setError(t("errors.postingFilled"));
          } else if (jobStatus === "paused") {
            setError(t("errors.postingPaused"));
          } else {
            setError(t("errors.postingExpired"));
          }
        } else if (code === "PORTAL_ERRORS.SEEKER_PROFILE_REQUIRED") {
          setError(t("errors.profileRequired"));
        } else {
          setError(t("errors.unexpected"));
        }
      }
    } catch {
      setError(t("errors.unexpected"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("drawer.title", { jobTitle, companyName })}</SheetTitle>
          <SheetDescription>{t("drawer.description")}</SheetDescription>
        </SheetHeader>

        {/* Profile preview */}
        {(profileHeadline || profileSkills.length > 0 || profileLocation) && (
          <div className="mt-4 rounded-md border p-3">
            <p className="text-sm font-medium">{t("drawer.profilePreviewHeading")}</p>
            {profileHeadline && (
              <p className="mt-1 text-sm text-muted-foreground">{profileHeadline}</p>
            )}
            {profileSkills.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {profileSkills.slice(0, 5).join(", ")}
              </p>
            )}
            {profileLocation && (
              <p className="mt-1 text-xs text-muted-foreground">{profileLocation}</p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          {error && (
            <div
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          {/* CV selector */}
          {cvsLoading ? (
            <p className="text-sm text-muted-foreground">Loading CVs…</p>
          ) : hasCvs ? (
            <div>
              <Label htmlFor="cv-select">{t("drawer.cvLabel")}</Label>
              <Select
                value={selectedCvId ?? ""}
                onValueChange={(val) => setSelectedCvId(val || null)}
              >
                <SelectTrigger id="cv-select" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {cvs.map((cv) => (
                    <SelectItem key={cv.id} value={cv.id}>
                      {cv.label ?? cv.file.originalFilename}
                      {cv.isDefault && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {t("drawer.cvDefaultBadge")}
                        </Badge>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="rounded-md border p-4 text-center">
              <p className="font-medium">{t("drawer.cvEmptyTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t("drawer.cvEmptyDescription")}</p>
              <a href="/profile" className="mt-2 inline-block text-sm underline">
                {t("drawer.cvEmptyCta")}
              </a>
            </div>
          )}

          {/* Cover letter */}
          {enableCoverLetter && (
            <div>
              <Label htmlFor="cover-letter">{t("drawer.coverLetterLabel")}</Label>
              <Textarea
                id="cover-letter"
                className="mt-1"
                placeholder={t("drawer.coverLetterPlaceholder")}
                maxLength={MAX_COVER_LETTER_CHARS}
                value={coverLetterText}
                onChange={(e) => setCoverLetterText(e.target.value)}
                aria-describedby="cover-letter-count"
              />
              <p
                id="cover-letter-count"
                aria-live="polite"
                className="mt-1 text-xs text-muted-foreground"
              >
                {t("drawer.coverLetterCharCount", { count: coverLetterText.length })}
              </p>
            </div>
          )}

          {/* Portfolio links */}
          <div>
            <Label>{t("drawer.portfolioLinksLabel")}</Label>
            <div className="mt-1 flex flex-col gap-2">
              {portfolioLinks.map((link, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    type="url"
                    placeholder={t("drawer.portfolioLinkPlaceholder")}
                    value={link}
                    onChange={(e) => handleLinkChange(i, e.target.value)}
                    aria-label={`Portfolio link ${i + 1}`}
                  />
                  {portfolioLinks.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={t("drawer.portfolioRemoveLink")}
                      onClick={() => handleRemoveLink(i)}
                    >
                      ✕
                    </Button>
                  )}
                </div>
              ))}
              {portfolioLinks.length < MAX_PORTFOLIO_LINKS && (
                <Button type="button" variant="ghost" size="sm" onClick={handleAddLink}>
                  {t("drawer.portfolioAddLink")}
                </Button>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              type="submit"
              disabled={submitting || (!cvsLoading && !hasCvs)}
              aria-busy={submitting}
            >
              {submitting ? t("button.applying") : t("drawer.submitButton")}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("drawer.cancelButton")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
