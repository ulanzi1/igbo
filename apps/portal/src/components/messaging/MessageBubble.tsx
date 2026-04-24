"use client";

import { useTranslations } from "next-intl";
import { useDensity } from "@/providers/density-context";
import type { PortalMessage, MessageStatus } from "@/hooks/use-portal-messages";

interface MessageBubbleProps {
  message: PortalMessage;
  isSelf: boolean;
  senderName?: string;
  /** F7: Called with _optimisticId when user clicks a failed message to retry */
  onRetry?: (optimisticId: string) => void;
}

function StatusIcon({ status }: { status: MessageStatus | undefined }) {
  if (!status || status === "sending") {
    return (
      <span aria-hidden="true" className="text-muted-foreground text-xs">
        ○
      </span>
    );
  }
  if (status === "sent") {
    return (
      <span aria-hidden="true" className="text-muted-foreground text-xs">
        ✓
      </span>
    );
  }
  if (status === "delivered") {
    return (
      <span aria-hidden="true" className="text-primary text-xs">
        ✓✓
      </span>
    );
  }
  if (status === "read") {
    return (
      <span aria-hidden="true" className="text-primary text-xs font-medium">
        ✓✓
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span aria-hidden="true" className="text-destructive text-xs">
        ✗
      </span>
    );
  }
  return null;
}

function formatTime(dateString: string): string {
  try {
    return new Date(dateString).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/** Format bytes into human-readable size string */
export function formatFileSize(bytes: number | null): string {
  if (bytes == null || bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function FileTypeLabel({ fileType }: { fileType: string | null }) {
  if (!fileType) return <span className="text-xs font-mono uppercase">FILE</span>;
  if (fileType === "application/pdf") return <span className="text-xs font-mono">PDF</span>;
  if (
    fileType === "application/msword" ||
    fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return <span className="text-xs font-mono">DOC</span>;
  }
  if (fileType === "text/plain") return <span className="text-xs font-mono">TXT</span>;
  if (IMAGE_MIME_TYPES.has(fileType)) return null; // thumbnails shown instead
  return <span className="text-xs font-mono uppercase">FILE</span>;
}

export function MessageBubble({ message, isSelf, senderName, onRetry }: MessageBubbleProps) {
  const t = useTranslations("Portal.messages");
  const { density } = useDensity();

  const paddingClass = density === "compact" ? "py-1 px-2" : "py-2 px-3";
  const isFailed = message._status === "failed";

  const statusLabel = message._status
    ? t(`status.${message._status}` as Parameters<typeof t>[0])
    : undefined;

  const handleRetryClick = () => {
    if (isFailed && onRetry && message._optimisticId) {
      onRetry(message._optimisticId);
    }
  };

  const attachments = message._attachments ?? [];

  return (
    <div
      className={`flex flex-col ${isSelf ? "items-end" : "items-start"} mb-1`}
      data-testid="message-bubble"
      data-self={isSelf}
    >
      {!isSelf && senderName && (
        <span className="text-xs text-muted-foreground mb-0.5 ml-1">{senderName}</span>
      )}
      <div
        role={isFailed ? "button" : undefined}
        tabIndex={isFailed ? 0 : undefined}
        onClick={isFailed ? handleRetryClick : undefined}
        onKeyDown={
          isFailed
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") handleRetryClick();
              }
            : undefined
        }
        className={[
          "max-w-[75%] rounded-lg",
          paddingClass,
          isSelf
            ? "bg-primary text-primary-foreground rounded-tr-none"
            : "bg-muted text-foreground rounded-tl-none",
          isFailed ? "opacity-70 cursor-pointer" : "",
        ].join(" ")}
      >
        {/* Message text */}
        {message.content && (
          <p
            className="text-sm whitespace-pre-wrap break-words"
            style={{ overflowWrap: "break-word" }}
          >
            {message.content}
          </p>
        )}

        {/* F7: Show retry prompt for failed messages */}
        {isFailed && <p className="text-xs text-destructive mt-1">{t("retryPrompt")}</p>}

        {/* Attachments */}
        {attachments.length > 0 && (
          <ul role="list" className="mt-2 flex flex-col gap-2">
            {attachments.map((attachment) => {
              const isImage = IMAGE_MIME_TYPES.has(attachment.fileType ?? "");
              const downloadHref = `/api/v1/upload/download/${attachment.id}`;

              return (
                <li key={attachment.id} role="listitem">
                  {isImage ? (
                    <a
                      href={downloadHref}
                      aria-label={`${t("download")} ${attachment.fileName}`}
                      className="block"
                    >
                      {/* Image thumbnail */}
                      <img
                        src={attachment.fileUrl}
                        alt={attachment.fileName}
                        className="max-w-[200px] rounded border border-border object-cover"
                        style={{ maxHeight: "150px" }}
                      />
                    </a>
                  ) : (
                    <div className="flex items-center gap-2">
                      <FileTypeLabel fileType={attachment.fileType ?? null} />
                      <div className="flex flex-col min-w-0">
                        <span
                          className="text-xs truncate max-w-[160px]"
                          title={attachment.fileName}
                        >
                          {attachment.fileName}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatFileSize(attachment.fileSize)}
                        </span>
                      </div>
                      <a
                        href={downloadHref}
                        aria-label={`${t("download")} ${attachment.fileName}`}
                        className="text-xs underline shrink-0"
                      >
                        {t("download")}
                      </a>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="flex items-center gap-1 mt-0.5 px-1">
        <time dateTime={message.createdAt} className="text-xs text-muted-foreground">
          {formatTime(message.createdAt)}
        </time>
        {isSelf && (
          <span aria-label={statusLabel}>
            <StatusIcon status={message._status} />
          </span>
        )}
      </div>
    </div>
  );
}
