// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@/test/test-utils";
import { EventDetailActions } from "./EventDetailActions";

vi.mock("next-auth/react", () => ({
  useSession: vi.fn().mockReturnValue({
    data: { user: { id: "creator-1" } },
    status: "authenticated",
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `Events.${key}`,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("EventDetailActions", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
  });

  it("renders edit and cancel buttons for event creator", () => {
    render(<EventDetailActions eventId="event-1" creatorId="creator-1" />);
    expect(screen.getByText("Events.cancel.button")).toBeInTheDocument();
  });

  it("returns null for non-creator", () => {
    render(<EventDetailActions eventId="event-1" creatorId="other-user" />);
    expect(screen.queryByText("Events.cancel.button")).not.toBeInTheDocument();
  });

  it("cancel dialog contains a textarea for reason", async () => {
    render(<EventDetailActions eventId="event-1" creatorId="creator-1" />);
    fireEvent.click(screen.getByText("Events.cancel.button"));
    await waitFor(() => {
      expect(
        screen.getByRole("textbox", { name: /Events\.cancel\.reasonLabel/i }),
      ).toBeInTheDocument();
    });
  });

  it("clicking confirm without reason shows inline error and does not call fetch", async () => {
    render(<EventDetailActions eventId="event-1" creatorId="creator-1" />);
    fireEvent.click(screen.getByText("Events.cancel.button"));

    // Click the confirm button (second button with cancel.button text, or the destructive one)
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    // Find the confirm/submit button inside the dialog
    const buttons = screen.getAllByRole("button");
    const confirmBtn = buttons.find(
      (b) => b.textContent === "Events.cancel.button" && b !== buttons[0],
    );
    if (confirmBtn) fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText("Events.cancel.reasonRequired")).toBeInTheDocument();
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("clicking confirm with reason calls fetch with cancellationReason in body", async () => {
    render(<EventDetailActions eventId="event-1" creatorId="creator-1" />);
    fireEvent.click(screen.getByText("Events.cancel.button"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Venue flooding" } });

    const buttons = screen.getAllByRole("button");
    const confirmBtn = buttons.find(
      (b) => b.textContent === "Events.cancel.button" && b !== buttons[0],
    );
    if (confirmBtn) fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/v1/events/event-1",
        expect.objectContaining({
          method: "DELETE",
          body: JSON.stringify({ cancellationReason: "Venue flooding" }),
        }),
      );
    });
  });

  it("closing dialog resets reason input", async () => {
    render(<EventDetailActions eventId="event-1" creatorId="creator-1" />);
    fireEvent.click(screen.getByText("Events.cancel.button"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Some reason" } });

    fireEvent.click(screen.getByText("Events.cancel.keepEvent"));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Re-open dialog
    fireEvent.click(screen.getByText("Events.cancel.button"));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
    expect(screen.getByRole("textbox")).toHaveValue("");
  });
});
