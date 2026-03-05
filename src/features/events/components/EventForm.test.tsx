// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@/test/test-utils";
import { EventForm } from "./EventForm";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => `Events.${key}`,
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: vi.fn().mockReturnValue({ push: vi.fn(), back: vi.fn() }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("EventForm", () => {
  beforeEach(() => {
    // Use per-mock reset — vi.clearAllMocks() breaks vi.mock() factories (Story 5.2 pattern)
  });

  it("renders all required fields (title, start/end time, format, recurrence)", () => {
    render(<EventForm mode="create" />);
    expect(screen.getByLabelText(/Events.fields.title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Events.fields.startTime/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Events.fields.endTime/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Events.fields.format/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Events.fields.recurrence/i)).toBeInTheDocument();
  });

  it("submit button disabled when title is empty", () => {
    render(<EventForm mode="create" />);
    const submitBtn = screen.getByText("Events.create.submitButton");
    expect(submitBtn).toBeDisabled();
  });

  it("shows group selector when eventType = 'group' is selected", () => {
    render(<EventForm mode="create" userGroups={[{ id: "g-1", name: "My Group" }]} />);
    const select = screen.getByLabelText(/Events.fields.eventType/i);
    fireEvent.change(select, { target: { value: "group" } });
    expect(screen.getByLabelText(/Events.fields.group/i)).toBeInTheDocument();
  });

  it("renders in 'edit' mode with initialData pre-populated", () => {
    render(
      <EventForm
        mode="edit"
        eventId="event-1"
        initialData={{ title: "My Existing Event", format: "hybrid" }}
      />,
    );
    expect(screen.getByDisplayValue("My Existing Event")).toBeInTheDocument();
    expect(screen.getByText("Events.edit.submitButton")).toBeInTheDocument();
  });

  it("shows validation error when start date is in the past", async () => {
    render(<EventForm mode="create" />);
    const titleInput = screen.getByLabelText(/Events.fields.title/i);
    const startInput = screen.getByLabelText(/Events.fields.startTime/i);
    const endInput = screen.getByLabelText(/Events.fields.endTime/i);

    fireEvent.change(titleInput, { target: { value: "Test Event" } });
    fireEvent.change(startInput, { target: { value: "2020-01-01T10:00" } });
    fireEvent.change(endInput, { target: { value: "2020-01-01T11:00" } });

    const submitBtn = screen.getByText("Events.create.submitButton");
    fireEvent.click(submitBtn);

    expect(await screen.findByText("Events.validation.futureDate")).toBeInTheDocument();
  });

  it("shows permission denied banner when server returns 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }),
    );

    render(<EventForm mode="create" />);
    const titleInput = screen.getByLabelText(/Events.fields.title/i);
    const startInput = screen.getByLabelText(/Events.fields.startTime/i);
    const endInput = screen.getByLabelText(/Events.fields.endTime/i);

    const futureStart = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
    const futureEnd = new Date(Date.now() + 90000000).toISOString().slice(0, 16);

    fireEvent.change(titleInput, { target: { value: "Test" } });
    fireEvent.change(startInput, { target: { value: futureStart } });
    fireEvent.change(endInput, { target: { value: futureEnd } });

    const submitBtn = screen.getByText("Events.create.submitButton");
    fireEvent.click(submitBtn);

    expect(await screen.findByText("Events.permissions.createRequired")).toBeInTheDocument();
  });
});
