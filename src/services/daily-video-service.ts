import "server-only";
import { env } from "@/env";
import type { VideoService, CreateMeetingResult, GetMeetingTokenResult } from "./video-service";

// ─── Daily REST API types ──────────────────────────────────────────────────────

interface DailyRoomProperties {
  enable_knocking: boolean;
  enable_breakout_rooms: boolean;
  exp: number; // Unix timestamp
  enable_recording?: "cloud" | "local";
}

interface DailyRoom {
  id: string;
  name: string;
  url: string;
  privacy: string;
  properties: DailyRoomProperties;
}

interface DailyMeetingTokenProperties {
  room_name: string;
  user_id: string;
  is_owner: boolean;
  exp: number; // Unix timestamp
}

interface DailyMeetingTokenResponse {
  token: string;
}

// ─── Implementation ────────────────────────────────────────────────────────────

/**
 * Daily.co implementation of VideoService.
 * All REST calls go server-side — credentials never exposed to client.
 */
export class DailyVideoService implements VideoService {
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(apiUrl: string, apiKey: string) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  private get headers() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.apiUrl}${path}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Daily API error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  }

  async createMeeting(eventId: string, endTime: Date): Promise<CreateMeetingResult> {
    // 1-hour buffer past event end so participants can wrap up
    const exp = Math.floor(endTime.getTime() / 1000) + 3600;

    // Deterministic room name from eventId (alphanumeric + dashes only, max 100 chars)
    const roomName = `igbo-evt-${eventId.replace(/[^a-z0-9]/gi, "").slice(0, 60)}`;

    const room = await this.request<DailyRoom>("/rooms", {
      name: roomName,
      properties: {
        enable_knocking: true,
        enable_breakout_rooms: true,
        exp,
        enable_recording: "cloud",
      } satisfies DailyRoomProperties,
    });

    return { roomUrl: room.url, roomName: room.name };
  }

  async getMeetingToken(
    roomName: string,
    userId: string,
    isOwner: boolean,
  ): Promise<GetMeetingTokenResult> {
    // Short-lived: 2 hours
    const exp = Math.floor(Date.now() / 1000) + 7200;

    const result = await this.request<DailyMeetingTokenResponse>("/meeting-tokens", {
      properties: {
        room_name: roomName,
        user_id: userId,
        is_owner: isOwner,
        exp,
      } satisfies DailyMeetingTokenProperties,
    });

    return { token: result.token };
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────────

export const dailyVideoService: VideoService = new DailyVideoService(
  env.DAILY_API_URL,
  env.DAILY_API_KEY,
);
