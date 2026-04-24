"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ConversationThread } from "./ConversationThread";

interface MessagingDrawerProps {
  applicationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  otherParticipantName: string;
}

interface ConversationStatus {
  exists: boolean;
  readOnly: boolean;
  unreadCount: number;
}

export function MessagingDrawer({
  applicationId,
  open,
  onOpenChange,
  otherParticipantName,
}: MessagingDrawerProps) {
  const t = useTranslations("Portal.messages");
  const [status, setStatus] = useState<ConversationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    if (!open || !applicationId) {
      // Reset for next open
      setIsLoading(true);
      setStatus(null);
      return;
    }

    setIsLoading(true);
    setFetchError(false);

    fetch(`/api/v1/conversations/${applicationId}/status`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ data: ConversationStatus }>;
      })
      .then((body) => {
        setStatus(body.data);
      })
      .catch(() => {
        setFetchError(true);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [open, applicationId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle>{otherParticipantName}</SheetTitle>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          {isLoading && (
            <div className="flex flex-col gap-3 p-4" data-testid="messaging-drawer-skeleton">
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-10 w-1/2" />
              <Skeleton className="h-10 w-2/3" />
            </div>
          )}

          {fetchError && !isLoading && (
            <div className="flex flex-1 items-center justify-center p-4 text-sm text-red-600">
              {t("loadError")}
            </div>
          )}

          {!isLoading && !fetchError && (
            <ConversationThread
              applicationId={applicationId}
              readOnly={status?.readOnly ?? false}
              otherParticipantName={otherParticipantName}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
