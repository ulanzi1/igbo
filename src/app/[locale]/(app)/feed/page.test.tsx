// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/server/auth/config", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/features/feed", () => ({
  FeedList: () => <div data-testid="feed-list" />,
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));

import { auth } from "@/server/auth/config";
import { redirect } from "next/navigation";
import FeedPage from "./page";

const mockAuth = vi.mocked(auth);
const mockRedirect = vi.mocked(redirect);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FeedPage", () => {
  it("renders FeedList when session exists", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-1", name: "Test" } } as Awaited<
      ReturnType<typeof auth>
    >);

    const Page = await FeedPage();
    render(Page as React.ReactElement);

    expect(screen.getByTestId("feed-list")).toBeInTheDocument();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("calls redirect('/') when session is null", async () => {
    mockAuth.mockResolvedValue(null);
    mockRedirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(FeedPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });

  it("page has export const dynamic = 'force-dynamic'", async () => {
    const mod = await import("./page");
    expect(mod.dynamic).toBe("force-dynamic");
  });
});
