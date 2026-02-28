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

const mockUpdateQuery = vi.fn();
const mockResults = [
  {
    messageId: "00000000-0000-4000-8000-000000000010",
    conversationId: "00000000-0000-4000-8000-000000000020",
    senderId: "00000000-0000-4000-8000-000000000002",
    senderDisplayName: "Alice",
    senderPhotoUrl: null,
    content: "Hello igbo world",
    snippet: "Hello <mark>igbo</mark> world",
    contentType: "text",
    createdAt: new Date("2026-02-01"),
    conversationType: "direct" as const,
    conversationName: "Alice",
  },
];

let mockSearchState = {
  query: "",
  updateQuery: mockUpdateQuery,
  results: [] as typeof mockResults,
  isLoading: false,
  error: null,
  hasQuery: false,
};

vi.mock("@/features/chat/hooks/use-message-search", () => ({
  useMessageSearch: () => mockSearchState,
}));

// Mock shadcn Dialog components
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    open,
    children,
  }: {
    open?: boolean;
    children: React.ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) => (open ? React.createElement("div", { "data-testid": "dialog" }, children) : null),
  DialogContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "dialog-content" }, children),
  DialogHeader: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) =>
    React.createElement("h2", null, children),
}));

vi.mock("@/db/queries/chat-conversations", () => ({}));

import { MessageSearch } from "./MessageSearch";

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchState = {
    query: "",
    updateQuery: mockUpdateQuery,
    results: [],
    isLoading: false,
    error: null,
    hasQuery: false,
  };
});

describe("MessageSearch", () => {
  it("renders input when dialog is open", () => {
    render(<MessageSearch isOpen={true} onNavigate={vi.fn()} onClose={vi.fn()} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  it("does not render dialog when isOpen is false", () => {
    render(<MessageSearch isOpen={false} onNavigate={vi.fn()} onClose={vi.fn()} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.queryByTestId("dialog")).not.toBeInTheDocument();
  });

  it("shows min-query hint when query is empty and hasQuery is false", () => {
    render(<MessageSearch isOpen={true} onNavigate={vi.fn()} onClose={vi.fn()} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByText("minQueryHint")).toBeInTheDocument();
  });

  it("shows loading state when isLoading is true", () => {
    mockSearchState = { ...mockSearchState, isLoading: true, hasQuery: true, query: "igbo" };
    render(<MessageSearch isOpen={true} onNavigate={vi.fn()} onClose={vi.fn()} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByText("searching")).toBeInTheDocument();
  });

  it("shows results list when results are returned", () => {
    mockSearchState = {
      ...mockSearchState,
      results: mockResults,
      hasQuery: true,
      query: "igbo",
    };
    render(<MessageSearch isOpen={true} onNavigate={vi.fn()} onClose={vi.fn()} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("calls onNavigate with conversationId and messageId when result is clicked", async () => {
    const mockNavigate = vi.fn();
    mockSearchState = {
      ...mockSearchState,
      results: mockResults,
      hasQuery: true,
      query: "igbo",
    };
    render(<MessageSearch isOpen={true} onNavigate={mockNavigate} onClose={vi.fn()} />, {
      wrapper: makeWrapper(),
    });

    const resultButton = screen.getByText("Alice").closest("button");
    fireEvent.click(resultButton!);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        "00000000-0000-4000-8000-000000000020",
        "00000000-0000-4000-8000-000000000010",
      );
    });
  });

  it("shows 'no results' message when hasQuery is true and results is empty", () => {
    mockSearchState = {
      ...mockSearchState,
      results: [],
      hasQuery: true,
      isLoading: false,
      query: "xyz",
    };
    render(<MessageSearch isOpen={true} onNavigate={vi.fn()} onClose={vi.fn()} />, {
      wrapper: makeWrapper(),
    });
    expect(screen.getByText("noResults")).toBeInTheDocument();
  });

  it("calls updateQuery when input value changes", () => {
    render(<MessageSearch isOpen={true} onNavigate={vi.fn()} onClose={vi.fn()} />, {
      wrapper: makeWrapper(),
    });
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "igbo" } });
    expect(mockUpdateQuery).toHaveBeenCalledWith("igbo");
  });
});
