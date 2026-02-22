// @vitest-environment jsdom
import { render, screen, fireEvent } from "@/test/test-utils";
import { EmptyState, EmptyStateSkeleton } from "./EmptyState";
import { SearchIcon } from "lucide-react";

const defaultProps = {
  icon: <SearchIcon data-testid="icon" />,
  title: "Chọtụ ndị ọrụ",
  description: "Ihe ọ bụla adịghị ebe a. Malite site n'ịchọta ndị mmadụ ị maara.",
  primaryAction: {
    label: "Chọọ ugbu a",
    onClick: vi.fn(),
  },
};

describe("EmptyState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the title correctly", () => {
    render(<EmptyState {...defaultProps} />);
    expect(screen.getByText(defaultProps.title)).toBeInTheDocument();
  });

  it("renders the description correctly", () => {
    render(<EmptyState {...defaultProps} />);
    expect(screen.getByText(defaultProps.description)).toBeInTheDocument();
  });

  it("renders the icon", () => {
    render(<EmptyState {...defaultProps} />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("renders the primary action button", () => {
    render(<EmptyState {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: defaultProps.primaryAction.label }),
    ).toBeInTheDocument();
  });

  it("calls primaryAction.onClick when primary button is clicked", () => {
    const onClick = vi.fn();
    render(<EmptyState {...defaultProps} primaryAction={{ label: "Chọọ", onClick }} />);
    fireEvent.click(screen.getByRole("button", { name: "Chọọ" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders optional secondaryAction when provided", () => {
    const secondaryAction = { label: "Lọ azụ", onClick: vi.fn() };
    render(<EmptyState {...defaultProps} secondaryAction={secondaryAction} />);
    expect(screen.getByRole("button", { name: "Lọ azụ" })).toBeInTheDocument();
  });

  it("does not render secondary button when secondaryAction is omitted", () => {
    render(<EmptyState {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
  });

  it("renders primaryAction as a link when href is provided", () => {
    render(<EmptyState {...defaultProps} primaryAction={{ label: "Gaa", href: "/members" }} />);
    const link = screen.getByRole("link", { name: "Gaa" });
    expect(link).toHaveAttribute("href", "/members");
  });

  it("has accessible role and aria-label on the container", () => {
    render(<EmptyState {...defaultProps} />);
    const container = screen.getByRole("status");
    expect(container).toHaveAttribute("aria-label", defaultProps.title);
  });
});

describe("EmptyStateSkeleton", () => {
  it("renders with aria-busy and aria-label for accessibility", () => {
    render(<EmptyStateSkeleton />);
    const container = screen.getByLabelText("Loading");
    expect(container).toHaveAttribute("aria-busy", "true");
  });

  it("renders skeleton elements for icon, title, description, and actions", () => {
    const { container } = render(<EmptyStateSkeleton />);
    // Should have multiple skeleton divs
    const skeletons = container.querySelectorAll("[data-slot='skeleton']");
    expect(skeletons.length).toBeGreaterThanOrEqual(4);
  });
});
