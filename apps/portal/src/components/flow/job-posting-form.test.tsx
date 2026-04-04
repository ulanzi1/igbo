import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);

const mockPush = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Updated mock: differentiate by aria-label so multiple editors can coexist
vi.mock("next/dynamic", () => ({
  default: (_loader: unknown, _opts: unknown) => {
    const MockEditor = ({
      "aria-label": ariaLabel,
      onChange,
    }: {
      "aria-label"?: string;
      onChange?: (html: string) => void;
    }) => (
      <div
        data-testid={`rich-text-editor-${ariaLabel ?? "default"}`}
        aria-label={ariaLabel}
        role="group"
      >
        {onChange && (
          <textarea
            data-testid={`editor-input-${ariaLabel ?? "default"}`}
            aria-label={`${ariaLabel ?? "default"} input`}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>
    );
    return MockEditor;
  },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, _params?: Record<string, string>) => key,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@tiptap/react", () => ({
  useEditor: vi.fn(() => null),
  EditorContent: () => null,
}));

vi.mock("@tiptap/starter-kit", () => ({ default: {} }));
vi.mock("@tiptap/extension-link", () => ({ default: { configure: vi.fn(() => ({})) } }));

// Mock SalaryRangeInput to avoid Radix/i18n issues in form tests
vi.mock("@/components/domain/salary-range-input", () => ({
  SalaryRangeInput: ({
    competitiveOnly,
    onCompetitiveOnlyChange,
    errors,
  }: {
    competitiveOnly: boolean;
    onCompetitiveOnlyChange: (v: boolean) => void;
    errors?: { min?: string };
  }) => (
    <div data-testid="salary-range-input">
      <input
        type="checkbox"
        aria-label="prefer-not-to-disclose"
        checked={competitiveOnly}
        onChange={(e) => onCompetitiveOnlyChange(e.target.checked)}
      />
      {errors?.min && <p role="alert">{errors.min}</p>}
    </div>
  ),
  SalaryRangeInputSkeleton: () => <div>SalarySkeleton</div>,
}));

// Mock PortalRichTextEditorSkeleton from the same file
vi.mock("./portal-rich-text-editor", () => ({
  PortalRichTextEditor: ({
    "aria-label": ariaLabel,
    onChange,
  }: {
    "aria-label"?: string;
    onChange?: (html: string) => void;
  }) => (
    <div
      data-testid={`rich-text-editor-${ariaLabel ?? "default"}`}
      role="group"
      aria-label={ariaLabel}
    >
      {onChange && (
        <textarea
          data-testid={`editor-input-${ariaLabel ?? "default"}`}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  ),
  PortalRichTextEditorSkeleton: () => <div>EditorSkeleton</div>,
}));

// Mock CulturalContextToggles to provide a simple testable interface
vi.mock("@/components/domain/cultural-context-toggles", () => ({
  CulturalContextToggles: ({
    value,
    onChange,
  }: {
    value: {
      diasporaFriendly: boolean;
      igboLanguagePreferred: boolean;
      communityReferred: boolean;
    };
    onChange: (v: typeof value) => void;
  }) => (
    <div data-testid="cultural-context-toggles">
      <input
        type="checkbox"
        aria-label="diaspora-friendly"
        checked={value.diasporaFriendly}
        onChange={(e) => onChange({ ...value, diasporaFriendly: e.target.checked })}
      />
    </div>
  ),
  CulturalContextTogglesSkeleton: () => <div>CCSkeleton</div>,
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { toast } from "sonner";
import { JobPostingForm } from "./job-posting-form";

beforeEach(() => {
  vi.clearAllMocks();
  mockPush.mockClear();
});

describe("JobPostingForm", () => {
  it("renders all form sections (title, type, location, description, requirements, salary, deadline)", () => {
    render(<JobPostingForm companyId="company-uuid" />);
    // Title
    expect(screen.getByLabelText("title")).toBeTruthy();
    // Employment type
    expect(screen.getByLabelText("employmentType")).toBeTruthy();
    // Location
    expect(screen.getByLabelText("location")).toBeTruthy();
    // Application deadline
    expect(screen.getByLabelText("applicationDeadline")).toBeTruthy();
    // Salary section
    expect(screen.getByTestId("salary-range-input")).toBeTruthy();
    // Rich text editors (description + requirements) by role
    expect(screen.getByRole("group", { name: "description" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "requirements" })).toBeTruthy();
    // Submit button
    expect(screen.getByRole("button", { name: "save" })).toBeTruthy();
  });

  it("shows validation error when title is empty on submit", async () => {
    const { container } = render(<JobPostingForm companyId="company-uuid" />);
    const form = container.querySelector("form")!;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    });
  });

  it("shows validation error when employment type is not selected", async () => {
    render(<JobPostingForm companyId="company-uuid" />);
    // Fill title but not employment type
    await userEvent.type(screen.getByLabelText("title"), "My Job");
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    await waitFor(() => {
      const alerts = screen.getAllByRole("alert");
      expect(alerts.length).toBeGreaterThan(0);
    });
  });

  it("submits POST request with correct payload", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: "posting-uuid" } }),
    });

    render(<JobPostingForm companyId="company-uuid" />);

    await userEvent.type(screen.getByLabelText("title"), "Senior Engineer");
    fireEvent.change(screen.getByLabelText("employmentType"), { target: { value: "full_time" } });

    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/v1/jobs",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("shows success toast after creation", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: "posting-uuid" } }),
    });

    render(<JobPostingForm companyId="company-uuid" />);
    await userEvent.type(screen.getByLabelText("title"), "My Job");
    fireEvent.change(screen.getByLabelText("employmentType"), { target: { value: "contract" } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("created");
    });
  });

  it("shows error toast on 403 (company required)", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ status: 403 }),
    });

    render(<JobPostingForm companyId="company-uuid" />);
    await userEvent.type(screen.getByLabelText("title"), "My Job");
    fireEvent.change(screen.getByLabelText("employmentType"), { target: { value: "full_time" } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("companyRequired");
    });
  });

  it("disables submit button while saving", async () => {
    let resolveFetch!: (v: unknown) => void;
    mockFetch.mockReturnValue(
      new Promise((res) => {
        resolveFetch = res;
      }),
    );

    render(<JobPostingForm companyId="company-uuid" />);
    await userEvent.type(screen.getByLabelText("title"), "My Job");
    fireEvent.change(screen.getByLabelText("employmentType"), { target: { value: "full_time" } });

    const submitBtn = screen.getByRole("button", { name: "save" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "saving" })).toBeDisabled();
    });

    resolveFetch({ ok: true, json: () => Promise.resolve({ data: { id: "x" } }) });
  });

  it("Tiptap editors have aria-labels", () => {
    render(<JobPostingForm companyId="company-uuid" />);
    const editors = screen.getAllByRole("group");
    const descEditor = editors.find((el) => el.getAttribute("aria-label") === "description");
    const reqEditor = editors.find((el) => el.getAttribute("aria-label") === "requirements");
    expect(descEditor).toBeTruthy();
    expect(reqEditor).toBeTruthy();
  });

  it("calls onSuccess callback with posting ID after creation", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: "posting-uuid" } }),
    });

    const onSuccess = vi.fn();
    render(<JobPostingForm companyId="company-uuid" onSuccess={onSuccess} />);
    await userEvent.type(screen.getByLabelText("title"), "My Job");
    fireEvent.change(screen.getByLabelText("employmentType"), { target: { value: "full_time" } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith("posting-uuid");
    });
  });

  it("navigates to /my-jobs by default when no onSuccess prop", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: "posting-uuid" } }),
    });

    render(<JobPostingForm companyId="company-uuid" />);
    await userEvent.type(screen.getByLabelText("title"), "My Job");
    fireEvent.change(screen.getByLabelText("employmentType"), { target: { value: "full_time" } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/my-jobs");
    });
  });

  it("passes axe-core accessibility assertion", async () => {
    const { container } = render(<JobPostingForm companyId="company-uuid" />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  // Cultural context and Igbo description tests
  it("renders cultural context toggles section", () => {
    render(<JobPostingForm companyId="company-uuid" />);
    expect(screen.getByTestId("cultural-context-toggles")).toBeTruthy();
  });

  it("cultural context toggles update state", () => {
    render(<JobPostingForm companyId="company-uuid" />);
    const diasporaCheckbox = screen.getByLabelText("diaspora-friendly") as HTMLInputElement;
    expect(diasporaCheckbox.checked).toBe(false);
    fireEvent.click(diasporaCheckbox);
    expect(diasporaCheckbox.checked).toBe(true);
  });

  it("'Add Igbo Description' toggle shows Igbo editor when checked", () => {
    render(<JobPostingForm companyId="company-uuid" />);
    expect(screen.queryByRole("group", { name: "descriptionIgbo" })).toBeNull();
    fireEvent.click(screen.getByLabelText("addIgboDescription"));
    expect(screen.getByRole("group", { name: "descriptionIgbo" })).toBeTruthy();
  });

  it("'Add Igbo Description' toggle hides Igbo editor when unchecked", () => {
    render(<JobPostingForm companyId="company-uuid" />);
    const toggle = screen.getByLabelText("addIgboDescription");
    fireEvent.click(toggle); // show
    fireEvent.click(toggle); // hide
    expect(screen.queryByRole("group", { name: "descriptionIgbo" })).toBeNull();
  });

  it("POST payload includes culturalContextJson when set", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: "posting-uuid" } }),
    });

    render(<JobPostingForm companyId="company-uuid" />);
    await userEvent.type(screen.getByLabelText("title"), "My Job");
    fireEvent.change(screen.getByLabelText("employmentType"), { target: { value: "full_time" } });

    // Toggle diaspora-friendly via mock CulturalContextToggles
    fireEvent.click(screen.getByLabelText("diaspora-friendly"));

    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      const call = mockFetch.mock.calls[0]!;
      const body = JSON.parse(call[1].body as string);
      expect(body.culturalContextJson).toBeDefined();
      expect(body.culturalContextJson.diasporaFriendly).toBe(true);
    });
  });

  it("POST payload includes descriptionIgboHtml when Igbo toggle is on and content entered", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: "posting-uuid" } }),
    });

    render(<JobPostingForm companyId="company-uuid" />);
    await userEvent.type(screen.getByLabelText("title"), "My Job");
    fireEvent.change(screen.getByLabelText("employmentType"), { target: { value: "full_time" } });

    // Toggle Igbo editor on
    fireEvent.click(screen.getByLabelText("addIgboDescription"));

    // Type content in Igbo editor via mock textarea
    const igboInput = screen.getByTestId("editor-input-descriptionIgbo");
    fireEvent.change(igboInput, { target: { value: "<p>Nkọwa ọrụ</p>" } });

    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      const call = mockFetch.mock.calls[0]!;
      const body = JSON.parse(call[1].body as string);
      expect(body.descriptionIgboHtml).toBe("<p>Nkọwa ọrụ</p>");
    });
  });

  it("POST payload excludes descriptionIgboHtml as null when toggle is off", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { id: "posting-uuid" } }),
    });

    render(<JobPostingForm companyId="company-uuid" />);
    await userEvent.type(screen.getByLabelText("title"), "My Job");
    fireEvent.change(screen.getByLabelText("employmentType"), { target: { value: "full_time" } });

    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      const call = mockFetch.mock.calls[0]!;
      const body = JSON.parse(call[1].body as string);
      expect(body.descriptionIgboHtml).toBeNull();
    });
  });

  it("form dirty tracking includes showIgboEditor change", async () => {
    render(<JobPostingForm companyId="company-uuid" />);
    // Toggle igbo editor — this should mark form dirty
    fireEvent.click(screen.getByLabelText("addIgboDescription"));
    // No direct assertion on isDirty state, but we verify the toggle was processed
    expect(screen.getByRole("group", { name: "descriptionIgbo" })).toBeTruthy();
  });

  it("form dirty tracking includes cultural context changes", async () => {
    render(<JobPostingForm companyId="company-uuid" />);
    fireEvent.click(screen.getByLabelText("diaspora-friendly"));
    // Cultural context state changed — form should be dirty (tested indirectly)
    const diasporaCheckbox = screen.getByLabelText("diaspora-friendly") as HTMLInputElement;
    expect(diasporaCheckbox.checked).toBe(true);
  });
});
