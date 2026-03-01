"use client";

import { useTranslations } from "next-intl";
import { useState, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { PostRichTextRenderer } from "./PostRichTextRenderer";
import type { FeedPost } from "@/features/feed/types";

interface FeedItemProps {
  post: FeedPost;
}

export function FeedItem({ post }: FeedItemProps) {
  const t = useTranslations("Feed");
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  const initials = post.authorDisplayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const relativeTime = formatRelativeTime(new Date(post.createdAt), t);
  const images = post.media.filter((m) => m.mediaType === "image");
  const videos = post.media.filter((m) => m.mediaType === "video");
  const audios = post.media.filter((m) => m.mediaType === "audio");

  const handleVideoClick = () => {
    if (!videoRef.current) return;
    if (isVideoPlaying) {
      videoRef.current.pause();
      setIsVideoPlaying(false);
    } else {
      void videoRef.current.play();
      setIsVideoPlaying(true);
    }
  };

  const handleMuteToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  return (
    <article
      className="rounded-lg border border-border bg-card p-4 space-y-3"
      aria-label={t("postByAuthor", { name: post.authorDisplayName })}
    >
      {/* Pinned indicator */}
      {post.isPinned && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span aria-hidden="true">📌</span>
          <span>{t("pinnedLabel")}</span>
        </div>
      )}

      {/* Author row */}
      <div className="flex items-center gap-3">
        <Link href={`/profiles/${post.authorId}`} aria-label={post.authorDisplayName}>
          <Avatar className="h-10 w-10">
            <AvatarImage src={post.authorPhotoUrl ?? undefined} alt={post.authorDisplayName} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/profiles/${post.authorId}`} className="text-sm font-medium hover:underline">
            {post.authorDisplayName}
          </Link>
          <p className="text-xs text-muted-foreground">{relativeTime}</p>
        </div>
        {post.contentType === "announcement" && (
          <Badge variant="secondary">{t("announcementBadge")}</Badge>
        )}
        {post.category !== "discussion" && (
          <Badge variant="outline" className="text-xs">
            {post.category === "event"
              ? t("composer.categoryEvent")
              : t("composer.categoryAnnouncement")}
          </Badge>
        )}
      </div>

      {/* Content */}
      <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
        {post.contentType === "rich_text" ? (
          <PostRichTextRenderer content={post.content} />
        ) : (
          post.content
        )}
      </div>

      {/* Images — user-uploaded content from S3 */}
      {images.length > 0 && (
        <div className={`grid gap-2 ${images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {images.slice(0, 4).map((img) => (
            <div
              key={img.id}
              className="flex items-center justify-center overflow-hidden rounded-md bg-muted max-h-[500px]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.mediaUrl}
                alt={img.altText ?? ""}
                className="max-h-[500px] max-w-full object-contain"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      )}

      {/* Video — inline playback, muted by default */}
      {videos.length > 0 && videos[0] && (
        <div className="relative aspect-video overflow-hidden rounded-md bg-black">
          <video
            ref={videoRef}
            src={videos[0].mediaUrl}
            className="h-full w-full object-contain"
            muted
            playsInline
            preload="metadata"
            onClick={handleVideoClick}
            aria-label={t("playVideo")}
          />
          {/* Play/pause overlay — shown when not playing */}
          {!isVideoPlaying && (
            <button
              type="button"
              onClick={handleVideoClick}
              className="absolute inset-0 flex items-center justify-center bg-black/20 min-h-[44px] min-w-[44px]"
              aria-label={t("playVideo")}
            >
              <span className="text-4xl text-white drop-shadow-lg">▶</span>
            </button>
          )}
          {/* Sound toggle — 44×44px tap target (NFR-A5) */}
          <button
            type="button"
            onClick={handleMuteToggle}
            className="absolute bottom-2 right-2 rounded-full bg-black/50 p-2 min-h-[44px] min-w-[44px] text-white text-xs"
            aria-label={isMuted ? t("soundOff") : t("soundOn")}
          >
            {isMuted ? "🔇" : "🔊"}
          </button>
        </div>
      )}

      {/* Audio */}
      {audios.length > 0 && (
        <div className="space-y-2">
          {audios.map((a) => (
            <audio
              key={a.id}
              src={a.mediaUrl}
              controls
              preload="metadata"
              className="w-full"
              aria-label={a.altText ?? t("playAudio")}
            />
          ))}
        </div>
      )}

      {/* Engagement counts — display only in Story 4.1 (interaction in Story 4.3) */}
      <div className="flex gap-4 text-xs text-muted-foreground pt-1 border-t border-border">
        <span>{t("likeCount", { count: post.likeCount })}</span>
        <span>{t("commentCount", { count: post.commentCount })}</span>
        <span>{t("shareCount", { count: post.shareCount })}</span>
      </div>
    </article>
  );
}

function formatRelativeTime(
  date: Date,
  t: (key: string, values?: Record<string, unknown>) => string,
): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return t("justNow");
  if (diffHours < 1) return t("minutesAgo", { count: diffMins });
  if (diffDays < 1) return t("hoursAgo", { count: diffHours });
  return t("daysAgo", { count: diffDays });
}
