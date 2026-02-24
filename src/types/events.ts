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

export interface MemberInfoRequestedEvent extends BaseEvent {
  userId: string;
  requestedBy: string;
}

export interface MemberRejectedEvent extends BaseEvent {
  userId: string;
  rejectedBy: string;
  reason?: string;
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

// --- Auth Events ---

export interface MemberLoggedInEvent extends BaseEvent {
  userId: string;
  sessionToken: string;
  deviceIp?: string;
}

export interface MemberLockedOutEvent extends BaseEvent {
  userId: string;
  deviceIp?: string;
}

export interface MemberPasswordResetEvent extends BaseEvent {
  userId: string;
}

export interface Member2faSetupEvent extends BaseEvent {
  userId: string;
}

export interface Member2faResetEvent extends BaseEvent {
  userId: string;
  resetBy: string;
}

// --- Profile / Onboarding Events ---

export interface MemberProfileUpdatedEvent extends BaseEvent {
  userId: string;
}

export interface MemberPrivacySettingsUpdatedEvent extends BaseEvent {
  userId: string;
}

export interface MemberSocialAccountLinkedEvent extends BaseEvent {
  userId: string;
  provider: string;
}

export interface MemberSocialAccountUnlinkedEvent extends BaseEvent {
  userId: string;
  provider: string;
}

export interface MemberProfileCompletedEvent extends BaseEvent {
  userId: string;
}

export interface MemberGuidelinesAcknowledgedEvent extends BaseEvent {
  userId: string;
}

export interface MemberOnboardingCompletedEvent extends BaseEvent {
  userId: string;
}

// --- Tier / Permission Events ---

export interface MemberTierChangedEvent extends BaseEvent {
  userId: string;
  previousTier: string;
  newTier: string;
  changedBy: string;
}

export interface PermissionDeniedEvent extends BaseEvent {
  userId: string;
  action: string;
  reason: string;
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
  | "member.info_requested"
  | "member.rejected"
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
  | "job.failed"
  | "member.logged_in"
  | "member.locked_out"
  | "member.password_reset"
  | "member.2fa_setup"
  | "member.2fa_reset"
  | "member.profile_updated"
  | "member.privacy_settings_updated"
  | "member.social_account_linked"
  | "member.social_account_unlinked"
  | "member.profile_completed"
  | "member.guidelines_acknowledged"
  | "member.onboarding_completed"
  | "member.tier_changed"
  | "member.permission_denied";

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
  "member.info_requested": MemberInfoRequestedEvent;
  "member.rejected": MemberRejectedEvent;
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
  "member.logged_in": MemberLoggedInEvent;
  "member.locked_out": MemberLockedOutEvent;
  "member.password_reset": MemberPasswordResetEvent;
  "member.2fa_setup": Member2faSetupEvent;
  "member.2fa_reset": Member2faResetEvent;
  "member.profile_updated": MemberProfileUpdatedEvent;
  "member.privacy_settings_updated": MemberPrivacySettingsUpdatedEvent;
  "member.social_account_linked": MemberSocialAccountLinkedEvent;
  "member.social_account_unlinked": MemberSocialAccountUnlinkedEvent;
  "member.profile_completed": MemberProfileCompletedEvent;
  "member.guidelines_acknowledged": MemberGuidelinesAcknowledgedEvent;
  "member.onboarding_completed": MemberOnboardingCompletedEvent;
  "member.tier_changed": MemberTierChangedEvent;
  "member.permission_denied": PermissionDeniedEvent;
}
