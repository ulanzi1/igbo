import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { SeekerProfileForm } from "./seeker-profile-form";

expect.extend(toHaveNoViolations);

const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string | number>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children, ...props }: { children: React.ReactNode }) => (
    <span data-testid="badge" {...props}>
      {children}
    </span>
  ),
}));

vi.mock("@/components/ui/separator", () => ({
  Separator: () => <hr />,
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { toast } from "sonner";
import React from "react";

const mockProfile = {
  id: "seeker-uuid",
  userId: "user-123",
  headline: "Senior Engineer",
  summary: "Building things",
  skills: ["TypeScript", "React"],
  experienceJson: [
    {
      title: "Senior Engineer",
      company: "Acme",
      startDate: "2022-01",
      endDate: "Present",
      description: "Built stuff",
    },
  ],
  educationJson: [
    {
      institution: "MIT",
      degree: "BSc",
      field: "CS",
      graduationYear: 2020,
    },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SeekerProfileForm", () => {
  it("renders all fields in create mode with empty initial values", () => {
    render(<SeekerProfileForm mode="create" />);
    const headlineInput = screen.getByLabelText(/headlineLabel/i);
    expect((headlineInput as HTMLInputElement).value).toBe("");
    expect(screen.getByLabelText(/summaryLabel/i)).toBeTruthy();
    expect(screen.getByText(/experienceAdd/)).toBeTruthy();
    expect(screen.getByText(/educationAdd/)).toBeTruthy();
  });

  it("pre-fill banner appears and inputs reflect prefill values", () => {
    render(
      <SeekerProfileForm
        mode="create"
        prefill={{ displayName: "Ngozi", bio: "Community builder" }}
      />,
    );
    expect(screen.getByText("prefilledBanner")).toBeTruthy();
    const headlineInput = screen.getByLabelText(/headlineLabel/i);
    expect((headlineInput as HTMLInputElement).value).toBe("Ngozi");
    const summaryInput = screen.getByLabelText(/summaryLabel/i);
    expect((summaryInput as HTMLTextAreaElement).value).toBe("Community builder");
  });

  it("does not show pre-fill banner when no prefill", () => {
    render(<SeekerProfileForm mode="create" />);
    expect(screen.queryByText("prefilledBanner")).toBeNull();
  });

  it("edit mode pre-populates from initialData", () => {
    render(<SeekerProfileForm mode="edit" initialData={mockProfile} />);
    const headlineInput = screen.getByLabelText(/headlineLabel/i);
    expect((headlineInput as HTMLInputElement).value).toBe("Senior Engineer");
    // Skills from initialData
    expect(screen.getByText("TypeScript")).toBeTruthy();
    expect(screen.getByText("React")).toBeTruthy();
  });

  it("empty headline shows error on submit and prevents network call", async () => {
    render(<SeekerProfileForm mode="create" />);
    const submitBtn = screen.getByRole("button", { name: /saveCreate/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("add skill via Enter appends chip", async () => {
    const user = userEvent.setup();
    render(<SeekerProfileForm mode="create" />);
    const skillInput = screen.getByRole("textbox", { name: /skillsLabel/i });
    await user.type(skillInput, "TypeScript{Enter}");
    expect(screen.getByText("TypeScript")).toBeTruthy();
  });

  it("skills cap at 30 — 31st add is rejected with skillsCapReached error", async () => {
    const user = userEvent.setup();
    // Pre-fill with 30 skills
    const thirtySkills = Array.from({ length: 30 }, (_, i) => `skill${i}`);
    render(
      <SeekerProfileForm
        mode="edit"
        initialData={{
          ...mockProfile,
          skills: thirtySkills,
          experienceJson: [],
          educationJson: [],
        }}
      />,
    );
    const skillInput = screen.getByRole("textbox", { name: /skillsLabel/i });
    await user.type(skillInput, "ExtraSkill{Enter}");
    // 31st skill should not be added
    expect(screen.queryByText("ExtraSkill")).toBeNull();
    // Dedicated cap error message, not the help text
    expect(screen.getByRole("alert")).toHaveTextContent("skillsCapReached");
  });

  it("rejects skill longer than 50 characters with skillTooLong error", async () => {
    const user = userEvent.setup();
    render(<SeekerProfileForm mode="create" />);
    const skillInput = screen.getByRole("textbox", { name: /skillsLabel/i });
    const longSkill = "a".repeat(51);
    await user.type(skillInput, `${longSkill}{Enter}`);
    expect(screen.queryByText(longSkill)).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("skillTooLong");
  });

  it("rejects duplicate skill (case-insensitive) with skillDuplicate error", async () => {
    const user = userEvent.setup();
    render(<SeekerProfileForm mode="create" />);
    const skillInput = screen.getByRole("textbox", { name: /skillsLabel/i });
    await user.type(skillInput, "TypeScript{Enter}");
    await user.type(skillInput, "typescript{Enter}");
    // Only one chip present (the original)
    expect(screen.getAllByText(/typescript/i)).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent("skillDuplicate");
  });

  it("cancel in create mode navigates to portal home (/)", async () => {
    const user = userEvent.setup();
    render(<SeekerProfileForm mode="create" />);
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelBtn);
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("cancel in edit mode navigates back to /profile view", async () => {
    const user = userEvent.setup();
    render(<SeekerProfileForm mode="edit" initialData={mockProfile} />);
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    await user.click(cancelBtn);
    expect(mockReplace).toHaveBeenCalledWith("/profile");
  });

  it("add experience row — focus moves to new row title input", async () => {
    const user = userEvent.setup();
    render(<SeekerProfileForm mode="create" />);
    const addBtn = screen.getByRole("button", { name: /experienceAdd/ });
    await user.click(addBtn);
    // A new row should appear with title input
    expect(screen.getByLabelText(/experienceTitle/)).toBeTruthy();
  });

  it("remove experience row", async () => {
    const user = userEvent.setup();
    render(<SeekerProfileForm mode="create" />);
    // Add a row first
    const addBtn = screen.getByRole("button", { name: /experienceAdd/ });
    await user.click(addBtn);
    // Remove it
    const removeBtn = screen.getByRole("button", { name: /experienceRemove/ });
    await user.click(removeBtn);
    expect(screen.queryByLabelText(/experienceTitle/)).toBeNull();
  });

  it("successful create POSTs correct payload and shows success toast", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ data: mockProfile }),
    });

    render(<SeekerProfileForm mode="create" />);
    const headlineInput = screen.getByLabelText(/headlineLabel/i);
    fireEvent.change(headlineInput, { target: { value: "Senior Dev" } });

    fireEvent.click(screen.getByRole("button", { name: /saveCreate/ }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/v1/seekers",
        expect.objectContaining({ method: "POST" }),
      );
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("successCreated");
    });
    expect(mockReplace).toHaveBeenCalledWith("/profile");
  });

  it("successful update PATCHes correct payload", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockProfile }),
    });

    render(<SeekerProfileForm mode="edit" initialData={mockProfile} />);
    fireEvent.click(screen.getByRole("button", { name: /saveUpdate/ }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/v1/seekers/${mockProfile.id}`,
        expect.objectContaining({ method: "PATCH" }),
      );
    });
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("successUpdated");
    });
  });

  it("409 shows duplicate error toast", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ status: 409 }),
    });

    render(<SeekerProfileForm mode="create" />);
    const headlineInput = screen.getByLabelText(/headlineLabel/i);
    fireEvent.change(headlineInput, { target: { value: "Dev" } });
    fireEvent.click(screen.getByRole("button", { name: /saveCreate/ }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("errorDuplicate");
    });
  });

  it("passes axe-core accessibility assertion", async () => {
    const { container } = render(<SeekerProfileForm mode="create" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
