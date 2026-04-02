"use client";

import type { SuggestionOptions } from "@tiptap/suggestion";

interface MemberItem {
  id: string;
  displayName: string;
}

type SuggestionRenderer = SuggestionOptions["render"];

interface MentionSuggestionOptions {
  noResultsLabel?: string;
}

/**
 * Build the Tiptap Mention extension suggestion config.
 * Fetches member suggestions from GET /api/v1/members?q=<query>.
 */
export function buildMentionSuggestion(
  options?: MentionSuggestionOptions,
): Partial<SuggestionOptions> {
  const noResults = options?.noResultsLabel ?? "No results";
  return {
    items: async ({ query }: { query: string }): Promise<MemberItem[]> => {
      if (query.length < 1) return [];
      try {
        const res = await fetch(`/api/v1/members?q=${encodeURIComponent(query)}&limit=5`, {
          credentials: "include",
        });
        if (!res.ok) return [];
        const data = (await res.json()) as { data?: { members?: MemberItem[] } };
        return data?.data?.members ?? [];
      } catch {
        return [];
      }
    },

    render: (): ReturnType<NonNullable<SuggestionRenderer>> => {
      let container: HTMLElement | null = null;

      return {
        onStart(props) {
          container = document.createElement("div");
          container.className =
            "bg-card border border-border rounded-md shadow-md z-50 min-w-[160px] overflow-hidden";
          container.style.position = "absolute";
          document.body.appendChild(container);

          renderList(container, props.items as MemberItem[], props.command, noResults);

          if (props.clientRect) {
            const rect = props.clientRect();
            if (rect) {
              container.style.top = `${rect.bottom + window.scrollY + 4}px`;
              container.style.left = `${rect.left + window.scrollX}px`;
            }
          }
        },

        onUpdate(props) {
          if (!container) return;
          renderList(container, props.items as MemberItem[], props.command, noResults);

          if (props.clientRect) {
            const rect = props.clientRect();
            if (rect) {
              container.style.top = `${rect.bottom + window.scrollY + 4}px`;
              container.style.left = `${rect.left + window.scrollX}px`;
            }
          }
        },

        onKeyDown(props) {
          if (props.event.key === "Escape") {
            container?.remove();
            container = null;
            return true;
          }
          return false;
        },

        onExit() {
          container?.remove();
          container = null;
        },
      };
    },
  };
}

function renderList(
  container: HTMLElement,
  items: MemberItem[],
  command: (attrs: { id: string; label: string }) => void,
  noResultsLabel: string,
): void {
  container.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "px-3 py-2 text-sm text-muted-foreground";
    empty.textContent = noResultsLabel;
    container.appendChild(empty);
    return;
  }

  for (const item of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "block w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors";
    btn.textContent = item.displayName;
    btn.addEventListener("click", () => {
      command({ id: item.id, label: item.displayName });
    });
    container.appendChild(btn);
  }
}
