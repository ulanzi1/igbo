// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { axe, toHaveNoViolations } from "jest-axe";
import type { Session } from "next-auth";

expect.extend(toHaveNoViolations);

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) => {
    if (params?.role) return `Switched to ${params.role}`;
    return key;
  },
  useLocale: () => "en",
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
}));

const mockToast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));
vi.mock("sonner", () => ({
  toast: mockToast,
}));

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RoleSwitcher } from "./role-switcher";

const mockUpdate = vi.fn();

function setSession(data: Partial<Session["user"]> | null) {
  if (data === null) {
    vi.mocked(useSession).mockReturnValue({
      data: null,
      status: "unauthenticated",
      update: mockUpdate,
    });
  } else {
    vi.mocked(useSession).mockReturnValue({
      data: {
        user: {
          id: "user-1",
          name: "Test User",
          role: "MEMBER",
          accountStatus: "APPROVED",
          profileCompleted: true,
          membershipTier: "BASIC",
          ...data,
        },
        expires: new Date(Date.now() + 86400000).toISOString(),
      } as Session,
      status: "authenticated",
      update: mockUpdate,
    });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue({ push: vi.fn() } as unknown as ReturnType<
    typeof useRouter
  >);
});

describe("RoleSwitcher", () => {
  it("renders nothing for unauthenticated user", () => {
    setSession(null);
    const { container } = render(<RoleSwitcher />);
    expect(container.firstChild).toBeNull();
  });

  it("renders static badge for single-role user (no dropdown trigger)", () => {
    setSession({ activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER"] });
    render(<RoleSwitcher />);
    expect(screen.getByText("seeker")).toBeInTheDocument();
    // No dropdown trigger (no ChevronDown button)
    expect(screen.queryByRole("button", { name: /switch portal role/i })).not.toBeInTheDocument();
  });

  it("renders dropdown trigger for multi-role user (2 roles)", () => {
    setSession({ activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER", "EMPLOYER"] });
    render(<RoleSwitcher />);
    expect(screen.getByRole("button", { name: "switchRoleLabel" })).toBeInTheDocument();
  });

  it("renders dropdown trigger for triple-role user (3 roles including JOB_ADMIN)", () => {
    setSession({
      activePortalRole: "JOB_SEEKER",
      portalRoles: ["JOB_SEEKER", "EMPLOYER", "JOB_ADMIN"],
    });
    render(<RoleSwitcher />);
    expect(screen.getByRole("button", { name: "switchRoleLabel" })).toBeInTheDocument();
  });

  it("calls update with activePortalRole on role selection", async () => {
    const user = userEvent.setup();
    mockUpdate.mockResolvedValue(undefined);
    setSession({ activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER", "EMPLOYER"] });
    render(<RoleSwitcher />);

    const trigger = screen.getByRole("button", { name: "switchRoleLabel" });
    await user.click(trigger);

    // Wait for dropdown content to appear
    await waitFor(() => {
      expect(screen.getByText("employer")).toBeInTheDocument();
    });

    await user.click(screen.getByText("employer"));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({ activePortalRole: "EMPLOYER" });
    });
  });

  it("redirects to /en/dashboard when switching to EMPLOYER", async () => {
    const user = userEvent.setup();
    mockUpdate.mockResolvedValue(undefined);
    const mockPush = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as unknown as ReturnType<
      typeof useRouter
    >);

    setSession({ activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER", "EMPLOYER"] });
    render(<RoleSwitcher />);

    await user.click(screen.getByRole("button", { name: "switchRoleLabel" }));
    await waitFor(() => expect(screen.getByText("employer")).toBeInTheDocument());
    await user.click(screen.getByText("employer"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/en/dashboard");
    });
  });

  it("redirects to /en/jobs when switching to JOB_SEEKER", async () => {
    const user = userEvent.setup();
    mockUpdate.mockResolvedValue(undefined);
    const mockPush = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as unknown as ReturnType<
      typeof useRouter
    >);

    setSession({ activePortalRole: "EMPLOYER", portalRoles: ["JOB_SEEKER", "EMPLOYER"] });
    render(<RoleSwitcher />);

    await user.click(screen.getByRole("button", { name: "switchRoleLabel" }));
    await waitFor(() => expect(screen.getByText("seeker")).toBeInTheDocument());
    await user.click(screen.getByText("seeker"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/en/jobs");
    });
  });

  it("redirects to /en/admin when switching to JOB_ADMIN", async () => {
    const user = userEvent.setup();
    mockUpdate.mockResolvedValue(undefined);
    const mockPush = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as unknown as ReturnType<
      typeof useRouter
    >);

    setSession({
      activePortalRole: "JOB_SEEKER",
      portalRoles: ["JOB_SEEKER", "EMPLOYER", "JOB_ADMIN"],
    });
    render(<RoleSwitcher />);

    await user.click(screen.getByRole("button", { name: "switchRoleLabel" }));
    await waitFor(() => expect(screen.getByText("jobAdmin")).toBeInTheDocument());
    await user.click(screen.getByText("jobAdmin"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/en/admin");
    });
  });

  it("shows toast notification after role switch", async () => {
    const user = userEvent.setup();
    mockUpdate.mockResolvedValue(undefined);
    setSession({ activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER", "EMPLOYER"] });
    render(<RoleSwitcher />);

    await user.click(screen.getByRole("button", { name: "switchRoleLabel" }));
    await waitFor(() => expect(screen.getByText("employer")).toBeInTheDocument());
    await user.click(screen.getByText("employer"));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith("Switched to employer");
    });
  });

  it("disables trigger while switch is in-flight", async () => {
    const user = userEvent.setup();
    let resolveUpdate!: () => void;
    mockUpdate.mockReturnValue(new Promise<void>((res) => (resolveUpdate = res)));

    setSession({ activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER", "EMPLOYER"] });
    render(<RoleSwitcher />);

    const trigger = screen.getByRole("button", { name: "switchRoleLabel" });
    await user.click(trigger);
    await waitFor(() => expect(screen.getByText("employer")).toBeInTheDocument());
    await user.click(screen.getByText("employer"));

    await waitFor(() => {
      expect(trigger).toBeDisabled();
    });

    resolveUpdate();
  });

  it("recovers gracefully when update() rejects (error toast, re-enables trigger)", async () => {
    const user = userEvent.setup();
    mockUpdate.mockRejectedValue(new Error("Network error"));
    setSession({ activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER", "EMPLOYER"] });
    render(<RoleSwitcher />);

    const trigger = screen.getByRole("button", { name: "switchRoleLabel" });
    await user.click(trigger);
    await waitFor(() => expect(screen.getByText("employer")).toBeInTheDocument());
    await user.click(screen.getByText("employer"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("switchingRole");
    });

    // Trigger should be re-enabled after failure
    await waitFor(() => {
      expect(trigger).not.toBeDisabled();
    });

    // Should NOT have redirected
    const { push } = vi.mocked(useRouter)();
    expect(push).not.toHaveBeenCalled();
  });

  it("has no accessibility violations (multi-role)", async () => {
    setSession({ activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER", "EMPLOYER"] });
    const { container } = render(<RoleSwitcher />);
    const results = await axe(container);
    // @ts-expect-error -- jest-axe extends expect at runtime via expect.extend(toHaveNoViolations)
    expect(results).toHaveNoViolations();
  });

  it("has no accessibility violations (single-role static badge)", async () => {
    setSession({ activePortalRole: "JOB_SEEKER", portalRoles: ["JOB_SEEKER"] });
    const { container } = render(<RoleSwitcher />);
    const results = await axe(container);
    // @ts-expect-error -- jest-axe extends expect at runtime via expect.extend(toHaveNoViolations)
    expect(results).toHaveNoViolations();
  });
});
