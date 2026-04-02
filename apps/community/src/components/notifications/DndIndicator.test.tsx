import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DndIndicator } from "./DndIndicator";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("lucide-react", () => ({
  Moon: ({ "aria-hidden": _hidden }: { "aria-hidden"?: boolean }) => (
    <svg data-testid="moon-icon" />
  ),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DndIndicator", () => {
  it("renders moon icon and label when isDnd=true", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { isDnd: true } }),
    });

    render(<DndIndicator userId="user-1" />, { wrapper });

    await waitFor(() => {
      expect(screen.getByTestId("moon-icon")).toBeInTheDocument();
      expect(screen.getByText("dndIndicator")).toBeInTheDocument();
    });
  });

  it("renders nothing when isDnd=false", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { isDnd: false } }),
    });

    const { container } = render(<DndIndicator userId="user-1" />, { wrapper });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when fetch fails", async () => {
    mockFetch.mockResolvedValue({ ok: false });

    const { container } = render(<DndIndicator userId="user-1" />, { wrapper });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    expect(container.firstChild).toBeNull();
  });

  it("fetches from correct URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { isDnd: false } }),
    });

    render(<DndIndicator userId="user-abc" />, { wrapper });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/v1/users/user-abc/dnd-status");
    });
  });
});
