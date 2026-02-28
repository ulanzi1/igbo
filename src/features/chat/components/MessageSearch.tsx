"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { SearchIcon, XIcon } from "lucide-react";
import { useMessageSearch } from "@/features/chat/hooks/use-message-search";
import type { MessageSearchResult } from "@/db/queries/chat-conversations";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface MessageSearchProps {
  isOpen: boolean;
  onNavigate: (conversationId: string, messageId: string) => void;
  onClose: () => void;
}

function formatDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function MessageSearch({ isOpen, onNavigate, onClose }: MessageSearchProps) {
  const t = useTranslations("Chat.search");
  const inputRef = useRef<HTMLInputElement>(null);
  const { query, updateQuery, results, isLoading, hasQuery } = useMessageSearch();

  // Autofocus on open
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure dialog is rendered
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  function handleResultClick(result: MessageSearchResult) {
    onNavigate(result.conversationId, result.messageId);
    onClose();
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="sr-only">{t("openSearch")}</DialogTitle>
          {/* Search input */}
          <div className="relative flex items-center">
            <SearchIcon
              className="absolute left-3 h-4 w-4 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => updateQuery(e.target.value)}
              placeholder={t("placeholder")}
              className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label={t("openSearch")}
            />
            {query && (
              <button
                type="button"
                onClick={() => updateQuery("")}
                className="absolute right-3 text-muted-foreground hover:text-foreground"
                aria-label={t("clearSearch")}
              >
                <XIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {/* Min query hint */}
          {!hasQuery && !query && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {t("minQueryHint")}
            </p>
          )}

          {/* Loading state */}
          {isLoading && (
            <div aria-live="polite" className="px-2 py-6 text-center text-sm text-muted-foreground">
              {t("searching")}
            </div>
          )}

          {/* No results */}
          {hasQuery && !isLoading && results.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t("noResults")}</p>
          )}

          {/* Results list */}
          {results.length > 0 && (
            <ul className="mt-1 space-y-1" role="listbox" aria-label={t("openSearch")}>
              {results.map((result) => (
                <li key={result.messageId}>
                  <button
                    type="button"
                    className="w-full rounded-md px-3 py-2 text-left hover:bg-accent transition-colors"
                    onClick={() => handleResultClick(result)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {result.senderDisplayName}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDate(result.createdAt)}
                      </span>
                    </div>
                    {/* Snippet with <mark> tags — safe: ts_headline only emits <mark>/<\/mark> */}
                    <p
                      className="mt-0.5 text-xs text-muted-foreground line-clamp-2"
                      dangerouslySetInnerHTML={{ __html: result.snippet }}
                    />
                    <p className="mt-0.5 text-xs text-muted-foreground/70">
                      {t("resultFrom", { name: result.conversationName })}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
