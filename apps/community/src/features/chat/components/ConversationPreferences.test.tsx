// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
}));

// Mock Sheet
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({
    open,
    children,
  }: {
    open?: boolean;
    children: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) => (open ? React.createElement("div", { "data-testid": "sheet" }, children) : null),
  SheetContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "sheet-content" }, children),
  SheetHeader: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  SheetTitle: ({ children }: { children: React.ReactNode }) =>
    React.createElement("h2", null, children),
}));

// Mock AlertDialog
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({
    open,
    children,
  }: {
    open?: boolean;
    children: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) =>
    open ? React.createElement("div", { "data-testid": "block-confirm-dialog" }, children) : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  AlertDialogAction: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    React.createElement("button", { "data-testid": "confirm-block", onClick }, children),
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) =>
    React.createElement("button", { "data-testid": "cancel-block" }, children),
}));

vi.mock("@igbo/db/queries/chat-conversations", () => ({}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { ConversationPreferences } from "./ConversationPreferences";

const CONV_ID = "00000000-0000-4000-8000-000000000003";
const MEMBER_ID = "00000000-0000-4000-8000-000000000002";

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function setupFetchMocks({
  pref = "all",
  dnd = false,
  isMuted = false,
  isBlocked = false,
}: {
  pref?: string;
  dnd?: boolean;
  isMuted?: boolean;
  isBlocked?: boolean;
} = {}) {
  mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
    if (url.includes("/preferences") && (!opts?.method || opts.method === "GET")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { notificationPreference: pref } }),
      });
    }
    if (url.includes("/user/dnd") && (!opts?.method || opts.method === "GET")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { dnd } }),
      });
    }
    if (url.includes("/block") && (!opts?.method || opts.method === "GET")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { isBlocked } }),
      });
    }
    if (url.includes("/mute") && (!opts?.method || opts.method === "GET")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: { isMuted } }),
      });
    }
    // Mutations
    return Promise.resolve({
      ok: true,
      json: async () => ({ data: { ok: true, dnd: !dnd } }),
    });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupFetchMocks();
});

describe("ConversationPreferences", () => {
  it("renders notification preference selector", async () => {
    render(
      <ConversationPreferences
        conversationId={CONV_ID}
        otherMemberId={MEMBER_ID}
        otherMemberName="Alice"
        isOpen={true}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(screen.getByText("notificationPreference")).toBeInTheDocument();
    });

    // Should show all 3 preference options
    expect(screen.getByDisplayValue("all")).toBeInTheDocument();
    expect(screen.getByDisplayValue("mentions")).toBeInTheDocument();
    expect(screen.getByDisplayValue("muted")).toBeInTheDocument();
  });

  it("calls PATCH /preferences when preference changes", async () => {
    render(<ConversationPreferences conversationId={CONV_ID} isOpen={true} onClose={vi.fn()} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => screen.getByDisplayValue("all"));

    fireEvent.click(screen.getByDisplayValue("mentions"));

    await waitFor(() => {
      const patchCall = mockFetch.mock.calls.find(
        (c) =>
          typeof c[0] === "string" && c[0].includes("/preferences") && c[1]?.method === "PATCH",
      );
      expect(patchCall).toBeTruthy();
    });
  });

  it("shows block button for direct conversations and opens confirmation dialog", async () => {
    render(
      <ConversationPreferences
        conversationId={CONV_ID}
        otherMemberId={MEMBER_ID}
        otherMemberName="Alice"
        isOpen={true}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => screen.getByText("notificationPreference"));

    // Block button text includes member name
    const blockButton = screen.getByText(/blockMember/);
    expect(blockButton).toBeInTheDocument();

    // Click block opens confirmation dialog
    fireEvent.click(blockButton);
    expect(screen.getByTestId("block-confirm-dialog")).toBeInTheDocument();
  });

  it("calls POST /block when block is confirmed", async () => {
    const onBlockComplete = vi.fn();
    render(
      <ConversationPreferences
        conversationId={CONV_ID}
        otherMemberId={MEMBER_ID}
        otherMemberName="Alice"
        isOpen={true}
        onClose={vi.fn()}
        onBlockComplete={onBlockComplete}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => screen.getByText(/blockMember/));
    fireEvent.click(screen.getByText(/blockMember/));
    expect(screen.getByTestId("block-confirm-dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("confirm-block"));

    await waitFor(() => {
      const blockCall = mockFetch.mock.calls.find(
        (c) =>
          typeof c[0] === "string" &&
          c[0].includes(`/members/${MEMBER_ID}/block`) &&
          c[1]?.method === "POST",
      );
      expect(blockCall).toBeTruthy();
    });
  });

  it("calls mute API when mute toggle is clicked", async () => {
    render(
      <ConversationPreferences
        conversationId={CONV_ID}
        otherMemberId={MEMBER_ID}
        otherMemberName="Alice"
        isOpen={true}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => screen.getByText("notificationPreference"));

    const muteButton = screen.getByText(/muteMember/);
    fireEvent.click(muteButton);

    await waitFor(() => {
      const muteCall = mockFetch.mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes(`/members/${MEMBER_ID}/mute`),
      );
      expect(muteCall).toBeTruthy();
    });
  });

  it("calls PATCH /user/dnd when DnD toggle is clicked", async () => {
    render(<ConversationPreferences conversationId={CONV_ID} isOpen={true} onClose={vi.fn()} />, {
      wrapper: makeWrapper(),
    });

    await waitFor(() => screen.getByText("doNotDisturb"));

    const dndToggle = screen.getByRole("switch");
    fireEvent.click(dndToggle);

    await waitFor(() => {
      const dndCall = mockFetch.mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("/user/dnd") && c[1]?.method === "PATCH",
      );
      expect(dndCall).toBeTruthy();
    });
  });

  it("shows 'Unblock' when member is already blocked and calls DELETE /block on click", async () => {
    setupFetchMocks({ isBlocked: true });
    render(
      <ConversationPreferences
        conversationId={CONV_ID}
        otherMemberId={MEMBER_ID}
        otherMemberName="Alice"
        isOpen={true}
        onClose={vi.fn()}
      />,
      { wrapper: makeWrapper() },
    );

    await waitFor(() => {
      expect(screen.getByText(/unblockMember/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/unblockMember/));

    await waitFor(() => {
      const unblockCall = mockFetch.mock.calls.find(
        (c) =>
          typeof c[0] === "string" &&
          c[0].includes(`/members/${MEMBER_ID}/block`) &&
          c[1]?.method === "DELETE",
      );
      expect(unblockCall).toBeTruthy();
    });
  });

  it("does not render when isOpen is false", () => {
    render(<ConversationPreferences conversationId={CONV_ID} isOpen={false} onClose={vi.fn()} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.queryByTestId("sheet")).not.toBeInTheDocument();
  });
});
