"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useEventMeeting } from "@/features/events/hooks/use-event-meeting";
import { useServiceHealth } from "@/lib/service-health";
import { NetworkQualityBadge } from "./DailyMeetingView";

// Lazy-load Daily meeting UI — client-only, never SSR'd
const DailyMeetingView = dynamic(
  () => import("./DailyMeetingView").then((m) => m.DailyMeetingView),
  {
    ssr: false,
    loading: () => <Skeleton className="h-48 w-full rounded-md" />,
  },
);

interface EventMeetingPanelProps {
  eventId: string;
}

export function EventMeetingPanel({ eventId }: EventMeetingPanelProps) {
  const t = useTranslations("Events.video");
  const tEvents = useTranslations("Events");
  const { videoAvailable } = useServiceHealth();
  const {
    meetingState,
    networkQuality,
    joinToken,
    roomUrl,
    error,
    handleJoin,
    handleLeave,
    handleNetworkQualityChange,
    handleJoinedMeeting,
  } = useEventMeeting(eventId);

  if (meetingState === "left") {
    return null;
  }

  if (!videoAvailable) {
    return (
      <div className="flex flex-col gap-2">
        <Button disabled size="sm" title={tEvents("videoUnavailable")}>
          {t("joinButton")}
        </Button>
        <p className="text-sm text-muted-foreground">{tEvents("videoUnavailable")}</p>
      </div>
    );
  }

  if (meetingState === "idle") {
    return (
      <div className="flex flex-col gap-2">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={handleJoin} size="sm">
          {t("joinButton")}
        </Button>
      </div>
    );
  }

  if (meetingState === "loading") {
    return (
      <div className="flex flex-col gap-2">
        <Button disabled size="sm">
          {t("joinButtonLoading")}
        </Button>
        <Skeleton className="h-48 w-full rounded-md" />
      </div>
    );
  }

  // meetingState === "active"
  if (!joinToken || !roomUrl) return null;

  return (
    <div className="flex flex-col gap-3 border rounded-lg p-4">
      <NetworkQualityBadge quality={networkQuality} />
      <DailyMeetingView
        token={joinToken}
        roomUrl={roomUrl}
        onLeave={handleLeave}
        onNetworkQualityChange={handleNetworkQualityChange}
        onJoinedMeeting={handleJoinedMeeting}
      />
    </div>
  );
}
