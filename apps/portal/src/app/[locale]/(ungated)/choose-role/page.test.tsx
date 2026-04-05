// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render } from "@testing-library/react";

vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn().mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock("@/components/choose-role/choose-role-form", () => ({
  ChooseRoleForm: ({ locale }: { locale: string }) => (
    <div data-testid="choose-role-form" data-locale={locale} />
  ),
}));

import { auth } from "@igbo/auth";
import ChooseRolePage from "./page";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("COMMUNITY_URL", "http://community.example");
  vi.stubEnv("PORTAL_PUBLIC_URL", "http://portal.example");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ChooseRolePage", () => {
  it("redirects to /{locale} when user already has portal roles", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", portalRoles: ["EMPLOYER"] },
    });

    await expect(ChooseRolePage({ params: Promise.resolve({ locale: "en" }) })).rejects.toThrow(
      "REDIRECT:/en",
    );
  });

  it("renders ChooseRoleForm when user has no portal roles", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "u1", portalRoles: [] },
    });

    const jsx = await ChooseRolePage({ params: Promise.resolve({ locale: "en" }) });
    const { getByTestId } = render(jsx as React.ReactElement);

    expect(getByTestId("choose-role-form")).toBeInTheDocument();
    expect(getByTestId("choose-role-form").getAttribute("data-locale")).toBe("en");
  });

  it("redirects unauthenticated user to community login with callbackUrl", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(ChooseRolePage({ params: Promise.resolve({ locale: "en" }) })).rejects.toThrow(
      "REDIRECT:",
    );

    const { redirect } = await import("next/navigation");
    const redirectCall = vi.mocked(redirect).mock.calls[0]?.[0] as string | undefined;
    expect(redirectCall).toBe(
      `http://community.example/login?callbackUrl=${encodeURIComponent("http://portal.example/en/choose-role")}`,
    );
  });
});
