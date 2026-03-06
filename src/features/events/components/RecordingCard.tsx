"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface RecordingCardProps {
  eventId: string;
  recordingStatus: "pending" | "mirroring" | "ready" | "lost";
  recordingUrl: string | null;
  mirrorUrl: string | null;
  expiresAt: Date | string | null;
  isPreserved: boolean;
  isCreatorOrAdmin: boolean;
}

export function RecordingCard({
  eventId,
  recordingStatus,
  recordingUrl,
  mirrorUrl,
  expiresAt,
  isPreserved,
  isCreatorOrAdmin,
}: RecordingCardProps) {
  const t = useTranslations("Events.recordings");
  const [preserving, setPreserving] = useState(false);
  const [preserved, setPreserved] = useState(isPreserved);

  const playUrl = mirrorUrl ?? recordingUrl;

  async function handleDownload() {
    const res = await fetch(`/api/v1/events/${eventId}/recording/download`, {
      method: "POST",
      headers: {
        Host: window.location.host,
        Origin: window.location.origin,
      },
    });
    if (!res.ok) return;
    const { data } = (await res.json()) as { data: { downloadUrl: string } };
    window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
  }

  async function handlePreserve() {
    setPreserving(true);
    try {
      const res = await fetch(`/api/v1/events/${eventId}/recording/preserve`, {
        method: "POST",
        headers: {
          Host: window.location.host,
          Origin: window.location.origin,
        },
      });
      if (res.ok) {
        setPreserved(true);
      }
    } finally {
      setPreserving(false);
    }
  }

  if (recordingStatus === "lost") {
    return (
      <div className="rounded-lg border bg-muted/50 p-4">
        <p className="text-sm text-muted-foreground">{t("recordingLost")}</p>
      </div>
    );
  }

  if (!expiresAt && recordingStatus !== "ready" && recordingStatus !== "mirroring") {
    return null;
  }

  // Check if recording is expired (expiresAt in the past and no URLs)
  if (!playUrl && recordingStatus !== "mirroring" && recordingStatus !== "ready") {
    return (
      <div className="rounded-lg border bg-muted/50 p-4">
        <p className="text-sm text-muted-foreground">{t("recordingExpired")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      {recordingStatus === "mirroring" && (
        <p className="text-sm text-muted-foreground">{t("mirrorPending")}</p>
      )}

      {recordingStatus === "ready" && (
        <>
          <div className="flex items-center gap-2">
            {preserved && <Badge variant="secondary">{t("preservedLabel")}</Badge>}
            {!preserved && expiresAt && (
              <Badge variant="outline" className="text-xs">
                {t("expiresOn", { date: new Date(expiresAt).toLocaleDateString() })}
              </Badge>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            {playUrl && (
              <Button size="sm" variant="outline" asChild>
                <a href={playUrl} target="_blank" rel="noopener noreferrer">
                  ▶ {t("playButton")}
                </a>
              </Button>
            )}
            {mirrorUrl && (
              <Button size="sm" variant="outline" onClick={handleDownload}>
                {t("downloadButton")}
              </Button>
            )}
            {isCreatorOrAdmin && !preserved && (
              <Button size="sm" variant="secondary" onClick={handlePreserve} disabled={preserving}>
                {t("preserveButton")}
              </Button>
            )}
          </div>
        </>
      )}

      {/* Fallback play for mirroring state (Daily source URL) */}
      {recordingStatus === "mirroring" && recordingUrl && (
        <Button size="sm" variant="outline" asChild>
          <a href={recordingUrl} target="_blank" rel="noopener noreferrer">
            ▶ {t("playSourceButton")}
          </a>
        </Button>
      )}
    </div>
  );
}
