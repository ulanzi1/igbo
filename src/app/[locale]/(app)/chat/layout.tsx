"use client";

import { ConversationList } from "@/features/chat/components/ConversationList";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden" data-testid="chat-layout">
      {/* ConversationList sidebar — hidden on mobile; split pane on tablet+ */}
      <aside
        data-testid="conversation-sidebar"
        className="hidden md:flex w-[300px] lg:w-[320px] flex-shrink-0 flex-col border-r border-border overflow-hidden"
      >
        <ConversationList />
      </aside>

      {/* Right pane — full width on mobile, remaining space on md+ */}
      <main className="flex flex-1 flex-col overflow-hidden min-w-0">{children}</main>
    </div>
  );
}
