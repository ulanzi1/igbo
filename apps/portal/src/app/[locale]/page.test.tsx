// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { Session } from "next-auth";

vi.mock("@igbo/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn().mockImplementation((namespace: string) => {
    return Promise.resolve((key: string) => `${namespace}.${key}`);
  }),
  setRequestLocale: vi.fn(),
}));

import { auth } from "@igbo/auth";
import Page from "./page";

describe("Portal Homepage [locale]/page", () => {
  it("shows seeker welcome message for authenticated seeker", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u1", activePortalRole: "JOB_SEEKER" } as Session["user"],
      expires: "2099-01-01",
    } as Session);

    const jsx = await Page({ params: Promise.resolve({ locale: "en" }) });
    const { getByText } = render(jsx as React.ReactElement);
    expect(getByText(/seekerWelcome/i)).toBeInTheDocument();
  });

  it("shows employer welcome message for authenticated employer", async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: "u2", activePortalRole: "EMPLOYER" } as Session["user"],
      expires: "2099-01-01",
    } as Session);

    const jsx = await Page({ params: Promise.resolve({ locale: "en" }) });
    const { getByText } = render(jsx as React.ReactElement);
    expect(getByText(/employerWelcome/i)).toBeInTheDocument();
  });

  it("shows guest welcome with login/join CTAs when auth returns null", async () => {
    vi.mocked(auth).mockResolvedValue(null);

    const jsx = await Page({ params: Promise.resolve({ locale: "en" }) });
    const { getByText } = render(jsx as React.ReactElement);
    expect(getByText(/guestWelcome/i)).toBeInTheDocument();
    // Login link text and join now link text
    expect(getByText("Portal.nav.login")).toBeInTheDocument();
    expect(getByText(/joinNow/i)).toBeInTheDocument();
  });

  it("guest login CTA has returnTo pointing to portal URL (not empty)", async () => {
    process.env.COMMUNITY_URL = "http://localhost:3000";
    process.env.NEXTAUTH_URL = "http://localhost:3001";
    vi.mocked(auth).mockResolvedValue(null);

    const jsx = await Page({ params: Promise.resolve({ locale: "en" }) });
    const { container } = render(jsx as React.ReactElement);
    const loginLink = container.querySelector("a[href*='/login']");
    expect(loginLink).toBeTruthy();
    const href = loginLink!.getAttribute("href")!;
    expect(href).toContain("returnTo=");
    // returnTo should include portal URL, not be empty
    const returnTo = decodeURIComponent(href.split("returnTo=")[1]!);
    expect(returnTo).toContain("http://localhost:3001/en");
  });
});
