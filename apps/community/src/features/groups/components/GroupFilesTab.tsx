"use client";

import { useTranslations } from "next-intl";
import { useInfiniteQuery } from "@tanstack/react-query";

interface GroupFileItem {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string | null;
  fileSize: number | null;
  uploadedAt: string;
  uploaderName: string | null;
  messageId: string;
  conversationId: string;
}

interface PageData {
  files: GroupFileItem[];
  nextCursor: number | null;
}

interface GroupFilesTabProps {
  groupId: string;
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeIcon(fileType: string | null): string {
  if (!fileType) return "📎";
  if (fileType.startsWith("image/")) return "🖼️";
  if (fileType.startsWith("video/")) return "🎬";
  if (fileType.startsWith("audio/")) return "🎵";
  if (fileType.includes("pdf")) return "📄";
  return "📎";
}

export function GroupFilesTab({ groupId }: GroupFilesTabProps) {
  const t = useTranslations("Groups");

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery<PageData>({
    queryKey: ["group-files", groupId],
    queryFn: async ({ pageParam }) => {
      const url = new URL(`/api/v1/groups/${groupId}/files`, window.location.origin);
      if (pageParam != null) url.searchParams.set("cursor", String(pageParam));
      url.searchParams.set("limit", "50");
      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch files");
      const json = (await res.json()) as { data: PageData };
      return json.data;
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const files = data?.pages.flatMap((p) => p.files) ?? [];

  if (files.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        {t("files.noFiles")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {files.map((file) => (
        <div
          key={file.id}
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
        >
          <span className="text-xl shrink-0">{fileTypeIcon(file.fileType)}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{file.fileName}</p>
            <p className="text-xs text-muted-foreground">
              {file.uploaderName && <span>{file.uploaderName} · </span>}
              {new Date(file.uploadedAt).toLocaleDateString()}
              {file.fileSize && <span> · {formatFileSize(file.fileSize)}</span>}
            </p>
          </div>
          <a
            href={file.fileUrl}
            download={file.fileName}
            className="shrink-0 rounded px-2 py-1 text-xs border border-border hover:bg-accent transition-colors min-h-[36px] flex items-center"
            aria-label={t("files.download")}
          >
            {t("files.download")}
          </a>
        </div>
      ))}

      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm hover:bg-accent transition-colors min-h-[36px]"
          >
            {isFetchingNextPage ? t("feed.loading") : t("feed.loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}
