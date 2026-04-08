// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render } from "@testing-library/react";

vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-intl/server", () => ({ setRequestLocale: vi.fn() }));
vi.mock("@/components/layout/portal-layout", () => ({
  PortalLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { auth } from "@igbo/auth";
import { redirect } from "next/navigation";
import GatedLayout from "./layout";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockRedirect = redirect as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GatedLayout — role gate", () => {
  it("redirects authenticated user with no portal roles to /choose-role", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", portalRoles: [] } });

    const jsx = await GatedLayout({
      children: <span>child</span>,
      params: Promise.resolve({ locale: "en" }),
    });
    render(jsx as React.ReactElement);

    expect(mockRedirect).toHaveBeenCalledWith("/en/choose-role");
  });

  it("renders children for authenticated user with portal roles", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", portalRoles: ["EMPLOYER"], activePortalRole: "EMPLOYER" },
    });

    const jsx = await GatedLayout({
      children: <span data-testid="child">child</span>,
      params: Promise.resolve({ locale: "en" }),
    });
    const { getByTestId } = render(jsx as React.ReactElement);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(getByTestId("child")).toBeInTheDocument();
  });

  it("renders children for unauthenticated user (guest browsing)", async () => {
    mockAuth.mockResolvedValue(null);

    const jsx = await GatedLayout({
      children: <span data-testid="guest-child">child</span>,
      params: Promise.resolve({ locale: "en" }),
    });
    const { getByTestId } = render(jsx as React.ReactElement);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(getByTestId("guest-child")).toBeInTheDocument();
  });

  it("redirect path includes correct locale", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", portalRoles: [] } });

    const jsx = await GatedLayout({
      children: <span>child</span>,
      params: Promise.resolve({ locale: "ig" }),
    });
    render(jsx as React.ReactElement);

    expect(mockRedirect).toHaveBeenCalledWith("/ig/choose-role");
  });
});
