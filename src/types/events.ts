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
  category?: string; // "discussion" | "event" | "announcement"
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
  /** Full message payload — required by EventBus bridge to emit message:new without a DB query */
  content: string;
  contentType: string;
  createdAt: string; // ISO 8601
  /** For threading — bridge includes in message:new so clients can show reply context without a DB round-trip */
  parentMessageId?: string | null;
  /** Populated by sendMessageWithAttachments — bridge includes in message:new without extra DB query */
  attachments?: Array<{
    id: string;
    fileUrl: string;
    fileName: string;
    fileType: string | null;
    fileSize: number | null;
  }>;
}

export interface MessageEditedEvent extends BaseEvent {
  messageId: string;
  conversationId: string;
  senderId: string;
  content: string;
  editedAt: string; // ISO 8601
}

export interface MessageDeletedEvent extends BaseEvent {
  messageId: string;
  conversationId: string;
  senderId: string;
}

export interface ReactionAddedEvent extends BaseEvent {
  messageId: string;
  conversationId: string;
  userId: string;
  emoji: string;
}

export interface ReactionRemovedEvent extends BaseEvent {
  messageId: string;
  conversationId: string;
  userId: string;
  emoji: string;
}

export interface ConversationCreatedEvent extends BaseEvent {
  conversationId: string;
  type: "group" | "direct" | "channel";
  /** All member user IDs (including creator) — bridge uses this to auto-join sockets */
  memberIds: string[];
}

export interface ConversationMemberAddedEvent extends BaseEvent {
  conversationId: string;
  newUserId: string;
  addedByUserId: string;
}

export interface ConversationMemberLeftEvent extends BaseEvent {
  conversationId: string;
  userId: string;
}

export interface MessageMentionedEvent extends BaseEvent {
  messageId: string;
  conversationId: string;
  senderId: string;
  /** All mentioned user IDs (no self-mentions) */
  mentionedUserIds: string[];
  /** First 100 chars of message content — used by Epic 9 for notification body */
  contentPreview: string;
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

export interface MemberDeletionRequestedEvent extends BaseEvent {
  userId: string;
}

export interface GdprExportReadyEvent extends BaseEvent {
  userId: string;
  requestId: string;
}

// --- Notification Events ---

export interface NotificationCreatedEvent extends BaseEvent {
  userId: string; // target recipient — used by bridge to route to user:{userId} room
  notificationId: string;
  type: string; // NotificationType enum value
  title: string;
  body: string;
  link?: string;
}

export interface NotificationReadEvent extends BaseEvent {
  userId: string;
  notificationId: string | "all"; // 'all' for mark-all-read
}

// --- File Upload Events ---

export interface FileProcessedEvent extends BaseEvent {
  fileUploadId: string;
  uploaderId: string;
  objectKey: string;
  processedUrl: string;
}

export interface FileQuarantinedEvent extends BaseEvent {
  fileUploadId: string;
  uploaderId: string;
  objectKey: string;
  reason: string;
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

export interface GroupCreatedEvent extends BaseEvent {
  groupId: string;
  creatorId: string;
}

export interface GroupUpdatedEvent extends BaseEvent {
  groupId: string;
  updatedBy: string;
}

export interface GroupArchivedEvent extends BaseEvent {
  groupId: string;
  archivedBy: string;
}

export interface GroupMemberJoinedEvent extends BaseEvent {
  groupId: string;
  userId: string;
}

export interface GroupMemberLeftEvent extends BaseEvent {
  groupId: string;
  userId: string;
}

export interface GroupJoinRequestedEvent extends BaseEvent {
  groupId: string;
  userId: string;
}

export interface GroupJoinApprovedEvent extends BaseEvent {
  groupId: string;
  userId: string;
  approvedBy: string;
}

export interface GroupJoinRejectedEvent extends BaseEvent {
  groupId: string;
  userId: string;
  rejectedBy: string;
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
  | "message.edited"
  | "message.deleted"
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
  | "member.deletion_requested"
  | "gdpr.export_ready"
  | "article.submitted"
  | "article.published"
  | "article.commented"
  | "group.created"
  | "group.updated"
  | "group.archived"
  | "group.member_joined"
  | "group.member_left"
  | "group.join_requested"
  | "group.join_approved"
  | "group.join_rejected"
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
  | "member.permission_denied"
  | "file.processed"
  | "file.quarantined"
  | "notification.created"
  | "notification.read"
  | "conversation.created"
  | "conversation.member_added"
  | "conversation.member_left"
  | "reaction.added"
  | "reaction.removed";

// --- Event Map ---

export interface EventMap {
  "user.created": UserCreatedEvent;
  "user.applied": UserAppliedEvent;
  "user.email_verified": UserEmailVerifiedEvent;
  "post.published": PostPublishedEvent;
  "post.reacted": PostReactedEvent;
  "post.commented": PostCommentedEvent;
  "message.sent": MessageSentEvent;
  "message.edited": MessageEditedEvent;
  "message.deleted": MessageDeletedEvent;
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
  "member.deletion_requested": MemberDeletionRequestedEvent;
  "gdpr.export_ready": GdprExportReadyEvent;
  "article.submitted": ArticleSubmittedEvent;
  "article.published": ArticlePublishedEvent;
  "article.commented": ArticleCommentedEvent;
  "group.created": GroupCreatedEvent;
  "group.updated": GroupUpdatedEvent;
  "group.archived": GroupArchivedEvent;
  "group.member_joined": GroupMemberJoinedEvent;
  "group.member_left": GroupMemberLeftEvent;
  "group.join_requested": GroupJoinRequestedEvent;
  "group.join_approved": GroupJoinApprovedEvent;
  "group.join_rejected": GroupJoinRejectedEvent;
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
  "file.processed": FileProcessedEvent;
  "file.quarantined": FileQuarantinedEvent;
  "notification.created": NotificationCreatedEvent;
  "notification.read": NotificationReadEvent;
  "conversation.created": ConversationCreatedEvent;
  "conversation.member_added": ConversationMemberAddedEvent;
  "conversation.member_left": ConversationMemberLeftEvent;
  "reaction.added": ReactionAddedEvent;
  "reaction.removed": ReactionRemovedEvent;
}
