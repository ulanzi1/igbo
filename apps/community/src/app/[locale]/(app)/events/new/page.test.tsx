// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockAuth = vi.fn();
const mockCanCreateEvent = vi.fn();
const mockGetGroupsForUserMembership = vi.fn();

class RedirectError extends Error {
  constructor(public destination: string) {
    super("NEXT_REDIRECT");
  }
}

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    throw new RedirectError(destination);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async (ns?: string | { locale: string; namespace: string }) => {
    const namespace = typeof ns === "string" ? ns : ns?.namespace;
    return (key: string) => `${namespace}.${key}`;
  },
  setRequestLocale: vi.fn(),
}));

vi.mock("@/server/auth/config", () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

vi.mock("@/services/permissions", () => ({
  canCreateEvent: (...args: unknown[]) => mockCanCreateEvent(...args),
  requireAuthenticatedSession: vi.fn().mockResolvedValue({ userId: "user-1", role: "MEMBER" }),
}));

vi.mock("@/db/queries/groups", () => ({
  getGroupsForUserMembership: (...args: unknown[]) => mockGetGroupsForUserMembership(...args),
  getGroupById: vi.fn(),
  getGroupMember: vi.fn(),
}));

vi.mock("@/features/events/components/EventForm", () => ({
  EventForm: () => <div data-testid="event-form">EventForm</div>,
}));

import NewEventPage from "./page";

describe("NewEventPage", () => {
  beforeEach(() => {
    mockAuth.mockReset();
    mockCanCreateEvent.mockReset();
    mockGetGroupsForUserMembership.mockReset();

    mockAuth.mockResolvedValue({
      user: { id: "user-1", name: "Test User", email: "test@test.com", role: "MEMBER" },
    });
    mockCanCreateEvent.mockResolvedValue({ allowed: true });
    mockGetGroupsForUserMembership.mockResolvedValue([]);
  });

  it("redirects to / when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null);
    const err = await NewEventPage().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RedirectError);
    expect((err as RedirectError).destination).toBe("/");
  });

  it("renders EventForm when user has PROFESSIONAL tier (canCreateEvent returns allowed)", async () => {
    mockCanCreateEvent.mockResolvedValue({ allowed: true });
    const Page = await NewEventPage();
    render(Page);
    expect(screen.getByTestId("event-form")).toBeInTheDocument();
  });
});
