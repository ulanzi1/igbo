"use client";

import { useEffect } from "react";
import {
  DailyProvider,
  useDaily,
  useParticipantIds,
  useScreenShare,
  useNetwork,
} from "@daily-co/daily-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { NetworkQuality } from "@/features/events/hooks/use-event-meeting";

// ─── Inner meeting component (must be inside DailyProvider) ──────────────────

interface MeetingInnerProps {
  onLeave: () => void;
  onNetworkQualityChange: (quality: "good" | "low" | "very-low") => void;
  onJoinedMeeting: () => void;
}

function MeetingInner({ onLeave, onNetworkQualityChange, onJoinedMeeting }: MeetingInnerProps) {
  const t = useTranslations("Events.video");
  const callObject = useDaily();
  const participantIds = useParticipantIds();
  const { isSharingScreen, startScreenShare, stopScreenShare } = useScreenShare();
  const { quality } = useNetwork();

  // Fire attendance mark on join
  useEffect(() => {
    if (!callObject) return;

    const handleJoined = () => {
      onJoinedMeeting();
    };

    callObject.on("joined-meeting", handleJoined);
    return () => {
      callObject.off("joined-meeting", handleJoined);
    };
  }, [callObject, onJoinedMeeting]);

  // Network quality badge
  useEffect(() => {
    if (quality?.threshold) {
      onNetworkQualityChange(quality.threshold as "good" | "low" | "very-low");
    }
  }, [quality, onNetworkQualityChange]);

  // Auto-disable video on very-low quality
  useEffect(() => {
    if (!callObject) return;
    if (quality?.threshold === "very-low") {
      callObject.setLocalVideo(false);
    }
  }, [callObject, quality]);

  const handleLeave = () => {
    callObject?.leave();
    onLeave();
  };

  const handleScreenShare = () => {
    if (isSharingScreen) {
      stopScreenShare();
    } else {
      startScreenShare();
    }
  };

  const handlePromoteCoHost = (sessionId: string) => {
    callObject?.updateParticipant(sessionId, { setIsOwner: true });
  };

  const localParticipant = callObject?.participants()?.local;
  const isOwner = localParticipant?.owner ?? false;

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Participants */}
      <div className="text-sm text-muted-foreground">
        {t("participantCount", { count: participantIds.length })}
      </div>

      {/* Co-host promotion panel (owner-only) */}
      {isOwner &&
        participantIds
          .filter((id) => id !== callObject?.participants()?.local?.session_id)
          .map((sessionId) => {
            const participant = callObject?.participants()[sessionId];
            if (!participant || participant.owner) return null;
            return (
              <div key={sessionId} className="flex items-center justify-between text-sm">
                <span>{participant.user_name ?? sessionId}</span>
                <Button size="sm" variant="outline" onClick={() => handlePromoteCoHost(sessionId)}>
                  {t("promoteCoHost")}
                </Button>
              </div>
            );
          })}

      {/* Controls */}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={handleScreenShare}>
          {isSharingScreen ? t("stopScreenShare") : t("screenShare")}
        </Button>
        <Button size="sm" variant="destructive" onClick={handleLeave}>
          {t("leaveButton")}
        </Button>
      </div>
    </div>
  );
}

// ─── Network quality badge (standalone) ──────────────────────────────────────

interface NetworkQualityBadgeProps {
  quality: NetworkQuality;
}

export function NetworkQualityBadge({ quality }: NetworkQualityBadgeProps) {
  const t = useTranslations("Events.video");
  if (!quality) return null;

  const variantMap: Record<
    string,
    { variant: "default" | "secondary" | "destructive"; label: string }
  > = {
    good: { variant: "default", label: t("networkGood") },
    low: { variant: "secondary", label: t("networkLow") },
    "very-low": { variant: "destructive", label: t("networkVeryLow") },
  };

  const entry = variantMap[quality];
  if (!entry) return null;
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

// ─── Exported component ───────────────────────────────────────────────────────

interface DailyMeetingViewProps {
  token: string;
  roomUrl: string;
  onLeave: () => void;
  onNetworkQualityChange: (quality: "good" | "low" | "very-low") => void;
  onJoinedMeeting: () => void;
}

export function DailyMeetingView({
  token,
  roomUrl,
  onLeave,
  onNetworkQualityChange,
  onJoinedMeeting,
}: DailyMeetingViewProps) {
  return (
    <DailyProvider url={roomUrl} token={token}>
      <MeetingInner
        onLeave={onLeave}
        onNetworkQualityChange={onNetworkQualityChange}
        onJoinedMeeting={onJoinedMeeting}
      />
    </DailyProvider>
  );
}
