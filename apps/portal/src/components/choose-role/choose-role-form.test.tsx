// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

const mockUpdate = vi.hoisted(() => vi.fn());
const mockPush = vi.hoisted(() => vi.fn());

vi.mock("next-auth/react", () => ({
  useSession: vi.fn().mockReturnValue({
    data: { user: { id: "u1" } },
    status: "authenticated",
    update: mockUpdate,
  }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      title: "Choose Your Path",
      subtitle: "How would you like to use the OBIGBO Job Portal?",
      "employer.title": "Employer",
      "employer.description": "Post jobs and find talent from the Igbo community.",
      "employer.cta": "Get Started as Employer",
      "seeker.title": "Job Seeker",
      "seeker.description": "Discover opportunities and connect with Igbo businesses.",
      "seeker.cta": "Get Started as Seeker",
      addMoreLater: "You can add more roles later from your portal settings.",
      error: "Something went wrong. Please try again.",
      selecting: "Setting up your account...",
    };
    return map[key] ?? key;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockToast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));
vi.mock("sonner", () => ({ toast: mockToast }));

import { useSession } from "next-auth/react";
import { ChooseRoleForm } from "./choose-role-form";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useSession).mockReturnValue({
    data: { user: { id: "u1" } } as never,
    status: "authenticated",
    update: mockUpdate,
  });
  mockPush.mockReset();
  global.fetch = vi.fn();
});

describe("ChooseRoleForm", () => {
  it("renders employer and seeker cards with translated text", () => {
    render(<ChooseRoleForm locale="en" />);
    expect(screen.getByText("Employer")).toBeInTheDocument();
    expect(screen.getByText("Job Seeker")).toBeInTheDocument();
    expect(screen.getByText("Get Started as Employer")).toBeInTheDocument();
    expect(screen.getByText("Get Started as Seeker")).toBeInTheDocument();
  });

  it("calls API with EMPLOYER role on employer card click", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { role: "EMPLOYER", activePortalRole: "EMPLOYER" } }),
    } as Response);
    mockUpdate.mockResolvedValue(undefined);

    render(<ChooseRoleForm locale="en" />);
    await user.click(screen.getByRole("button", { name: /Get Started as Employer/ }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/portal/role/select",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ role: "EMPLOYER" }),
        }),
      );
    });
  });

  it("calls API with JOB_SEEKER role on seeker card click", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { role: "JOB_SEEKER", activePortalRole: "JOB_SEEKER" } }),
    } as Response);
    mockUpdate.mockResolvedValue(undefined);

    render(<ChooseRoleForm locale="en" />);
    await user.click(screen.getByRole("button", { name: /Get Started as Seeker/ }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/portal/role/select",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ role: "JOB_SEEKER" }),
        }),
      );
    });
  });

  it("disables both cards and announces loading via aria-live during API call", async () => {
    const user = userEvent.setup();
    let resolveFetch!: (value: Response | PromiseLike<Response>) => void;
    vi.mocked(global.fetch).mockReturnValue(
      new Promise<Response>((res) => {
        resolveFetch = res;
      }),
    );

    render(<ChooseRoleForm locale="en" />);
    await user.click(screen.getByRole("button", { name: /Get Started as Employer/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Get Started as Employer/ })).toBeDisabled();
      expect(screen.getByRole("button", { name: /Get Started as Seeker/ })).toBeDisabled();
    });

    // aria-live region should contain the selecting text
    expect(screen.getByText("Setting up your account...")).toBeInTheDocument();

    resolveFetch({ ok: false } as Response);
  });

  it("handles 409 by refreshing session and redirecting to home (no toast)", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({}),
    } as Response);
    mockUpdate.mockResolvedValue(undefined);

    render(<ChooseRoleForm locale="en" />);
    await user.click(screen.getByRole("button", { name: /Get Started as Employer/ }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith("/en");
    });
    expect(mockToast.error).not.toHaveBeenCalled();
  });

  it("re-enables cards and shows error toast on API failure", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue({ ok: false } as Response);

    render(<ChooseRoleForm locale="en" />);
    await user.click(screen.getByRole("button", { name: /Get Started as Employer/ }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Something went wrong. Please try again.");
    });

    // Cards should be re-enabled
    expect(screen.getByRole("button", { name: /Get Started as Employer/ })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Get Started as Seeker/ })).not.toBeDisabled();
  });

  it("calls session update and redirects on success", async () => {
    const user = userEvent.setup();
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { role: "EMPLOYER", activePortalRole: "EMPLOYER" } }),
    } as Response);
    mockUpdate.mockResolvedValue(undefined);

    render(<ChooseRoleForm locale="en" />);
    await user.click(screen.getByRole("button", { name: /Get Started as Employer/ }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ activePortalRole: "EMPLOYER" });
      expect(mockPush).toHaveBeenCalledWith("/en/onboarding");
    });
  });

  it("axe-core accessibility", async () => {
    const { container } = render(<ChooseRoleForm locale="en" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
