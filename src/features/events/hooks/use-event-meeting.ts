"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

export type MeetingState = "idle" | "loading" | "active" | "left";
export type NetworkQuality = "good" | "low" | "very-low" | null;

interface JoinTokenResponse {
  token: string;
  roomUrl: string;
}

interface UseEventMeetingResult {
  meetingState: MeetingState;
  networkQuality: NetworkQuality;
  joinToken: string | null;
  roomUrl: string | null;
  error: string | null;
  handleJoin: () => void;
  handleLeave: () => void;
  handleNetworkQualityChange: (quality: "good" | "low" | "very-low") => void;
  handleJoinedMeeting: () => void;
}

export function useEventMeeting(eventId: string): UseEventMeetingResult {
  const [meetingState, setMeetingState] = useState<MeetingState>("idle");
  const [networkQuality, setNetworkQuality] = useState<NetworkQuality>(null);
  const [joinToken, setJoinToken] = useState<string | null>(null);
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const joinTokenMutation = useMutation({
    mutationFn: async (): Promise<JoinTokenResponse> => {
      const res = await fetch(`/api/v1/events/${eventId}/join-token`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const json = (await res.json()) as { title?: string };
        throw new Error(json.title ?? "Failed to get meeting token");
      }
      const json = (await res.json()) as { data: JoinTokenResponse };
      return json.data;
    },
    onMutate: () => {
      setMeetingState("loading");
      setError(null);
    },
    onSuccess: (data) => {
      setJoinToken(data.token);
      setRoomUrl(data.roomUrl);
      setMeetingState("active");
    },
    onError: (err: Error) => {
      setError(err.message);
      setMeetingState("idle");
    },
  });

  const attendanceMutation = useMutation({
    mutationFn: async () => {
      await fetch(`/api/v1/events/${eventId}/attended`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "video" }),
      });
      // Swallow errors — attendance sync failure is non-fatal
    },
  });

  const handleJoin = () => {
    joinTokenMutation.mutate();
  };

  const handleLeave = () => {
    setMeetingState("left");
    setJoinToken(null);
  };

  const handleNetworkQualityChange = (quality: "good" | "low" | "very-low") => {
    setNetworkQuality(quality);
  };

  const handleJoinedMeeting = () => {
    attendanceMutation.mutate();
  };

  return {
    meetingState,
    networkQuality,
    joinToken,
    roomUrl,
    error,
    handleJoin,
    handleLeave,
    handleNetworkQualityChange,
    handleJoinedMeeting,
  };
}
