/** Base fields shared by all event payloads */
interface BaseEvent {
  timestamp: string; // ISO 8601
}

// --- User Events ---

export interface UserCreatedEvent extends BaseEvent {
  userId: string;
}

export interface UserAppliedEvent extends BaseEvent {
  userId: string;
}

export interface UserEmailVerifiedEvent extends BaseEvent {
  userId: string;
}

// --- Post Events ---

export interface PostPublishedEvent extends BaseEvent {
  postId: string;
  authorId: string;
  groupId?: string;
}

export interface PostReactedEvent extends BaseEvent {
  postId: string;
  userId: string;
  reaction: string;
}

export interface PostCommentedEvent extends BaseEvent {
  postId: string;
  commentId: string;
  userId: string;
}

// --- Message Events ---

export interface MessageSentEvent extends BaseEvent {
  messageId: string;
  senderId: string;
  conversationId: string;
}

export interface MessageMentionedEvent extends BaseEvent {
  messageId: string;
  mentionedUserId: string;
  senderId: string;
  conversationId: string;
}

// --- Points Events ---

export interface PointsAwardedEvent extends BaseEvent {
  userId: string;
  points: number;
  reason: string;
}

// --- Member Events ---

export interface MemberBannedEvent extends BaseEvent {
  userId: string;
  bannedBy: string;
  reason?: string;
}

export interface MemberApprovedEvent extends BaseEvent {
  userId: string;
  approvedBy: string;
}

export interface MemberFollowedEvent extends BaseEvent {
  followerId: string;
  followedId: string;
}

export interface MemberUnfollowedEvent extends BaseEvent {
  followerId: string;
  followedId: string;
}

export interface MemberAnonymizingEvent extends BaseEvent {
  userId: string;
}

export interface MemberAnonymizedEvent extends BaseEvent {
  userId: string;
}

// --- Article Events ---

export interface ArticleSubmittedEvent extends BaseEvent {
  articleId: string;
  authorId: string;
}

export interface ArticlePublishedEvent extends BaseEvent {
  articleId: string;
  authorId: string;
}

export interface ArticleCommentedEvent extends BaseEvent {
  articleId: string;
  commentId: string;
  userId: string;
}

// --- Group Events ---

export interface GroupArchivedEvent extends BaseEvent {
  groupId: string;
  archivedBy: string;
}

// --- Event (Calendar) Events ---

export interface EventAttendedEvent extends BaseEvent {
  eventId: string;
  userId: string;
}

// --- Recording Events ---

export interface RecordingExpiredEvent extends BaseEvent {
  recordingId: string;
  eventId: string;
}

// --- Job Events ---

export interface JobFailedEvent extends BaseEvent {
  jobName: string;
  error: string;
  attempts: number;
}

// --- Event Name Union Type ---

export type EventName =
  | "user.created"
  | "user.applied"
  | "user.email_verified"
  | "post.published"
  | "post.reacted"
  | "post.commented"
  | "message.sent"
  | "message.mentioned"
  | "points.awarded"
  | "member.banned"
  | "member.approved"
  | "member.followed"
  | "member.unfollowed"
  | "member.anonymizing"
  | "member.anonymized"
  | "article.submitted"
  | "article.published"
  | "article.commented"
  | "group.archived"
  | "event.attended"
  | "recording.expired"
  | "job.failed";

// --- Event Map ---

export interface EventMap {
  "user.created": UserCreatedEvent;
  "user.applied": UserAppliedEvent;
  "user.email_verified": UserEmailVerifiedEvent;
  "post.published": PostPublishedEvent;
  "post.reacted": PostReactedEvent;
  "post.commented": PostCommentedEvent;
  "message.sent": MessageSentEvent;
  "message.mentioned": MessageMentionedEvent;
  "points.awarded": PointsAwardedEvent;
  "member.banned": MemberBannedEvent;
  "member.approved": MemberApprovedEvent;
  "member.followed": MemberFollowedEvent;
  "member.unfollowed": MemberUnfollowedEvent;
  "member.anonymizing": MemberAnonymizingEvent;
  "member.anonymized": MemberAnonymizedEvent;
  "article.submitted": ArticleSubmittedEvent;
  "article.published": ArticlePublishedEvent;
  "article.commented": ArticleCommentedEvent;
  "group.archived": GroupArchivedEvent;
  "event.attended": EventAttendedEvent;
  "recording.expired": RecordingExpiredEvent;
  "job.failed": JobFailedEvent;
}
