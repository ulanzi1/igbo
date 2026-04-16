import { describe, it, expect, vi, beforeEach } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import userEvent from "@testing-library/user-event";
import { renderWithPortalProviders, screen, waitFor } from "@/test-utils/render";
import { KeywordManager } from "./keyword-manager";
import { screeningKeywordFactory } from "@/test/factories";

// jsdom doesn't implement pointer capture — required by Radix Select
Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  setPointerCapture: () => undefined,
  releasePointerCapture: () => undefined,
  scrollIntoView: () => undefined,
});

expect.extend(toHaveNoViolations);

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

global.fetch = vi.fn();

const MOCK_KEYWORD = screeningKeywordFactory({
  id: "kw-1",
  phrase: "illegal offer",
  category: "illegal",
  notes: "Common scam pattern",
  createdByAdminId: "admin-1",
  createdAt: new Date("2026-04-01"),
  updatedAt: new Date("2026-04-01"),
});

beforeEach(() => {
  vi.clearAllMocks();
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }),
  });
});

describe("KeywordManager", () => {
  it("renders empty state when no keywords", () => {
    renderWithPortalProviders(<KeywordManager initialKeywords={[]} initialTotal={0} />);
    expect(screen.getByTestId("empty-state")).toBeInTheDocument();
  });

  it("renders keyword rows when keywords are provided", () => {
    renderWithPortalProviders(<KeywordManager initialKeywords={[MOCK_KEYWORD]} initialTotal={1} />);
    expect(screen.getByTestId(`keyword-row-${MOCK_KEYWORD.id}`)).toBeInTheDocument();
    expect(screen.getByText("illegal offer")).toBeInTheDocument();
  });

  it("renders add keyword button", () => {
    renderWithPortalProviders(<KeywordManager initialKeywords={[]} initialTotal={0} />);
    expect(screen.getByTestId("add-keyword-button")).toBeInTheDocument();
  });

  it("opens add modal on button click", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<KeywordManager initialKeywords={[]} initialTotal={0} />);

    await user.click(screen.getByTestId("add-keyword-button"));
    // Modal opens — check for dialog
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("opens edit modal when edit button clicked", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<KeywordManager initialKeywords={[MOCK_KEYWORD]} initialTotal={1} />);

    await user.click(screen.getByTestId(`edit-keyword-${MOCK_KEYWORD.id}`));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // Phrase should be pre-filled
    const input = screen.getByTestId("edit-phrase-input") as HTMLInputElement;
    expect(input.value).toBe("illegal offer");
  });

  it("opens delete dialog when delete button clicked", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<KeywordManager initialKeywords={[MOCK_KEYWORD]} initialTotal={1} />);

    await user.click(screen.getByTestId(`delete-keyword-${MOCK_KEYWORD.id}`));
    // AlertDialog opens
    await waitFor(() => {
      expect(screen.getByTestId("delete-keyword-confirm")).toBeInTheDocument();
    });
  });

  it("refetches list after add success", async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: true, json: vi.fn().mockResolvedValue({}) }) // POST /keywords
      .mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ data: { items: [MOCK_KEYWORD], total: 1 } }),
      }); // GET /keywords

    renderWithPortalProviders(<KeywordManager initialKeywords={[]} initialTotal={0} />);

    await user.click(screen.getByTestId("add-keyword-button"));

    const phraseInput = screen.getByTestId("add-phrase-input");
    await user.type(phraseInput, "scam keyword");

    await user.click(screen.getByTestId("add-category-select"));
    // Radix Select renders options in a portal — click the first occurrence
    const options = screen.getAllByText("Discriminatory language");
    await user.click(options.at(-1)!);

    await user.click(screen.getByTestId("add-keyword-submit"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/admin/screening/keywords",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("has no accessibility violations (empty)", async () => {
    const { container } = renderWithPortalProviders(
      <KeywordManager initialKeywords={[]} initialTotal={0} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no accessibility violations (with keywords)", async () => {
    const { container } = renderWithPortalProviders(
      <KeywordManager initialKeywords={[MOCK_KEYWORD]} initialTotal={1} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
