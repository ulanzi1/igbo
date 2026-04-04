import "server-only";
/**
 * VideoService abstraction — decouples the app from any specific video provider.
 * The Daily.co implementation lives in daily-video-service.ts.
 */

export interface CreateMeetingResult {
  roomUrl: string;
  roomName: string;
}

export interface GetMeetingTokenResult {
  token: string;
}

export interface VideoService {
  /**
   * Provision a new meeting room for an event.
   * @param eventId - Platform event ID used to derive a deterministic room name.
   * @param endTime  - Room expiry time (1h buffer applied by implementation).
   */
  createMeeting(eventId: string, endTime: Date): Promise<CreateMeetingResult>;

  /**
   * Issue a short-lived meeting token for a participant.
   * @param roomName - Provider room name (returned by createMeeting).
   * @param userId   - Platform user ID (embedded in token for audit).
   * @param isOwner  - True if the user is the event creator/host.
   */
  getMeetingToken(
    roomName: string,
    userId: string,
    isOwner: boolean,
  ): Promise<GetMeetingTokenResult>;
}
