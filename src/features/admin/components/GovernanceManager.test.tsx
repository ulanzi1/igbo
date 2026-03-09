import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockUseQuery = vi.fn();
const mockUseMutation = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
  useMutation: (...args: unknown[]) => mockUseMutation(...args),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { GovernanceManager } from "./GovernanceManager";

const MOCK_DOCS = {
  documents: [
    {
      id: "doc-1",
      title: "About Us",
      slug: "about-us",
      content: "<p>Hello</p>",
      contentIgbo: null,
      version: 1,
      status: "draft",
      visibility: "public",
      publishedAt: null,
      updatedAt: "2026-01-01T00:00:00Z",
    },
    {
      id: "doc-2",
      title: "Privacy Policy",
      slug: "privacy-policy",
      content: "<p>Policy</p>",
      contentIgbo: "<p>Iwu</p>",
      version: 2,
      status: "published",
      visibility: "public",
      publishedAt: "2026-01-02T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
    },
  ],
};

const pendingMutation = { mutate: vi.fn(), isPending: false };

describe("GovernanceManager", () => {
  it("shows loading state", () => {
    mockUseQuery.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    mockUseMutation.mockReturnValue(pendingMutation);
    render(<GovernanceManager />);
    expect(screen.getByText("loading")).toBeInTheDocument();
  });

  it("shows error state", () => {
    mockUseQuery.mockReturnValue({ isLoading: false, isError: true, data: undefined });
    mockUseMutation.mockReturnValue(pendingMutation);
    render(<GovernanceManager />);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("renders document list", () => {
    mockUseQuery.mockReturnValue({ isLoading: false, isError: false, data: MOCK_DOCS });
    mockUseMutation.mockReturnValue(pendingMutation);
    render(<GovernanceManager />);
    expect(screen.getByText("About Us")).toBeInTheDocument();
    expect(screen.getByText("Privacy Policy")).toBeInTheDocument();
  });

  it("shows publish button for draft documents", () => {
    mockUseQuery.mockReturnValue({ isLoading: false, isError: false, data: MOCK_DOCS });
    mockUseMutation.mockReturnValue(pendingMutation);
    render(<GovernanceManager />);
    expect(screen.getByText("publish")).toBeInTheDocument();
  });

  it("shows create new button", () => {
    mockUseQuery.mockReturnValue({ isLoading: false, isError: false, data: MOCK_DOCS });
    mockUseMutation.mockReturnValue(pendingMutation);
    render(<GovernanceManager />);
    expect(screen.getByText("createNew")).toBeInTheDocument();
  });

  it("shows empty state when no documents", () => {
    mockUseQuery.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { documents: [] },
    });
    mockUseMutation.mockReturnValue(pendingMutation);
    render(<GovernanceManager />);
    expect(screen.getByText("empty")).toBeInTheDocument();
  });
});
