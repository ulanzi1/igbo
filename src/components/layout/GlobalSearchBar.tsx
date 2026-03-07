"use client";

import { useState, useRef, useId, useCallback } from "react";
import { SearchIcon, XIcon, LoaderIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useGlobalSearch } from "@/features/discover/hooks/use-global-search";
import type { SearchResultItem } from "@/features/discover/hooks/use-global-search";
import { cn } from "@/lib/utils";

function SearchResultRow({
  item,
  isActive,
  onSelect,
  index,
}: {
  item: SearchResultItem;
  isActive: boolean;
  onSelect: (item: SearchResultItem) => void;
  index: number;
}) {
  const t = useTranslations("GlobalSearch");

  return (
    <li id={`search-item-${index}`} role="option" aria-selected={isActive}>
      <button
        type="button"
        onClick={() => onSelect(item)}
        className={cn(
          "flex w-full items-start gap-3 px-4 py-2 text-left text-sm transition-colors",
          isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted",
        )}
      >
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl}
            alt=""
            aria-hidden="true"
            className="size-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase text-muted-foreground">
            {item.title[0] ?? "?"}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{item.title}</span>
          {item.subtitle && (
            <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
          )}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {t(
            `sections.${item.type as "members" | "posts" | "articles" | "groups" | "events" | "documents"}`,
          )}
        </span>
      </button>
    </li>
  );
}

export function GlobalSearchBar({ className }: { className?: string }) {
  const t = useTranslations("GlobalSearch");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const { data, isLoading, isDeferred, enabled } = useGlobalSearch(query);

  // Flatten all result items across sections for keyboard navigation
  const allItems: SearchResultItem[] = data?.sections.flatMap((s) => s.items).slice(0, 15) ?? [];

  const handleSelect = useCallback(
    (item: SearchResultItem) => {
      setOpen(false);
      setQuery("");
      router.push(item.href as "/");
    },
    [router],
  );

  const handleSubmit = useCallback(() => {
    if (activeIndex >= 0 && allItems[activeIndex]) {
      handleSelect(allItems[activeIndex]);
      return;
    }
    if (query.trim().length >= 3) {
      setOpen(false);
      router.push({ pathname: "/search", query: { q: query.trim() } } as Parameters<
        typeof router.push
      >[0]);
    }
  }, [activeIndex, allItems, handleSelect, query, router]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!open) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) => Math.min(prev + 1, allItems.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) => Math.max(prev - 1, -1));
          break;
        case "Enter":
          e.preventDefault();
          handleSubmit();
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          setActiveIndex(-1);
          inputRef.current?.blur();
          break;
        default:
          break;
      }
    },
    [open, allItems.length, handleSubmit],
  );

  const showDropdown = open && (enabled || query.length > 0);

  return (
    <div
      className={cn("relative flex-1 mx-4 max-w-xs", className)}
      role="search"
      aria-label={t("ariaLabel")}
    >
      <div className="relative flex w-full items-center gap-2 rounded-full border border-border bg-muted px-4 h-10 text-sm">
        {isLoading && isDeferred ? (
          <LoaderIcon
            className="size-4 shrink-0 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        ) : (
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listboxId : undefined}
          aria-activedescendant={activeIndex >= 0 ? `search-item-${activeIndex}` : undefined}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay to allow click events on results to fire first
            setTimeout(() => setOpen(false), 150);
          }}
          onKeyDown={handleKeyDown}
          placeholder={t("placeholder")}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          autoComplete="off"
          spellCheck={false}
        />
        {query.length > 0 && (
          <button
            type="button"
            aria-label={t("clearAriaLabel")}
            onClick={() => {
              setQuery("");
              setOpen(false);
              setActiveIndex(-1);
              inputRef.current?.focus();
            }}
            className="flex items-center justify-center rounded-full p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <XIcon className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border bg-background shadow-lg overflow-hidden">
          <ul
            id={listboxId}
            role="listbox"
            aria-label={t("ariaLabel")}
            className="max-h-80 overflow-y-auto py-1"
          >
            {query.length > 0 && query.length < 3 && (
              <li className="px-4 py-3 text-sm text-muted-foreground">{t("minChars")}</li>
            )}

            {enabled && isLoading && (
              <li className="px-4 py-3 text-sm text-muted-foreground">{t("loading")}</li>
            )}

            {enabled && !isLoading && data && allItems.length === 0 && (
              <li className="px-4 py-3 text-sm text-muted-foreground">
                {t("noResults", { query: query.trim() })}
              </li>
            )}

            {allItems.map((item, idx) => (
              <SearchResultRow
                key={`${item.type}-${item.id}`}
                item={item}
                isActive={idx === activeIndex}
                onSelect={handleSelect}
                index={idx}
              />
            ))}

            {enabled && !isLoading && data && allItems.length > 0 && (
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleSubmit}
                  className="flex w-full items-center justify-center gap-1 border-t border-border px-4 py-2.5 text-sm font-medium text-primary hover:bg-muted transition-colors"
                >
                  <SearchIcon className="size-3.5" aria-hidden="true" />
                  {t("seeAll", { section: query.trim() })}
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
