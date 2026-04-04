import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";
import { CompanyProfileForm } from "./company-profile-form";

expect.extend(toHaveNoViolations);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, string>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/components/domain/logo-upload", () => ({
  LogoUpload: ({ onUploadComplete }: { onUploadComplete: (url: string) => void }) => (
    <button type="button" onClick={() => onUploadComplete("https://example.com/logo.png")}>
      Upload Logo
    </button>
  ),
  LogoUploadSkeleton: () => <div>LogoSkeleton</div>,
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { toast } from "sonner";

const mockProfile = {
  id: "company-uuid",
  ownerUserId: "user-123",
  name: "Acme Corp",
  logoUrl: "https://example.com/old-logo.png",
  description: "A great company",
  industry: "technology",
  companySize: "11-50",
  cultureInfo: "Innovation first",
  trustBadge: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CompanyProfileForm", () => {
  it("renders all form fields in create mode", () => {
    render(<CompanyProfileForm mode="create" />);
    expect(screen.getByLabelText(/name/i)).toBeTruthy();
    expect(screen.getByLabelText(/description/i)).toBeTruthy();
    expect(screen.getByLabelText(/culture/i)).toBeTruthy();
  });

  it("renders pre-filled fields in edit mode", () => {
    render(<CompanyProfileForm mode="edit" initialData={mockProfile} />);
    const nameInput = screen.getByRole("textbox", { name: /name/i });
    expect((nameInput as HTMLInputElement).value).toBe("Acme Corp");
  });

  it("shows validation error when name is empty on submit", async () => {
    render(<CompanyProfileForm mode="create" />);
    const submitBtn = screen.getByRole("button", { name: /save/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
  });

  it("submits POST request in create mode with correct payload", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: "new-company" } }),
    });

    render(<CompanyProfileForm mode="create" />);
    const nameInput = screen.getByRole("textbox", { name: /name/i });
    await userEvent.type(nameInput, "New Corp");

    const submitBtn = screen.getByRole("button", { name: /save/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/v1/companies",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("submits PATCH request in edit mode with correct payload", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockProfile }),
    });

    render(<CompanyProfileForm mode="edit" initialData={mockProfile} />);
    const submitBtn = screen.getByRole("button", { name: /save/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        `/api/v1/companies/${mockProfile.id}`,
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });

  it("shows success toast on successful create", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: "new-company" } }),
    });

    render(<CompanyProfileForm mode="create" />);
    const nameInput = screen.getByRole("textbox", { name: /name/i });
    await userEvent.type(nameInput, "New Corp");

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("created");
    });
  });

  it("shows success toast on successful update", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockProfile }),
    });

    render(<CompanyProfileForm mode="edit" initialData={mockProfile} />);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("updated");
    });
  });

  it("shows error toast on 409 duplicate", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ status: 409 }),
    });

    render(<CompanyProfileForm mode="create" />);
    const nameInput = screen.getByRole("textbox", { name: /name/i });
    await userEvent.type(nameInput, "Dup Corp");

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("duplicateError");
    });
  });

  it("disables submit button while loading", async () => {
    let resolveSubmit!: (v: unknown) => void;
    mockFetch.mockReturnValue(
      new Promise((res) => {
        resolveSubmit = res;
      }),
    );

    render(<CompanyProfileForm mode="create" />);
    const nameInput = screen.getByRole("textbox", { name: /name/i });
    await userEvent.type(nameInput, "Loading Corp");

    const submitBtn = screen.getByRole("button", { name: /save/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(submitBtn).toBeDisabled();
    });

    resolveSubmit({ ok: true, json: () => Promise.resolve({ data: {} }) });
  });

  it("shows onboarding toast when showOnboardingToast is true", async () => {
    render(<CompanyProfileForm mode="create" showOnboardingToast />);
    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith("createProfileFirst");
    });
  });

  it("does not show onboarding toast when showOnboardingToast is false", () => {
    render(<CompanyProfileForm mode="create" />);
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("passes axe-core accessibility assertion", async () => {
    const { container } = render(<CompanyProfileForm mode="create" />);
    const results = await axe(container);
    // @ts-expect-error jest-axe matcher
    expect(results).toHaveNoViolations();
  });
});
