// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { axe, toHaveNoViolations } from "jest-axe";
import userEvent from "@testing-library/user-event";
import { renderWithPortalProviders, screen, waitFor } from "@/test-utils/render";
import { NotesSection } from "./notes-section";
import type { ApplicationNote } from "@igbo/db/queries/portal-application-notes";

expect.extend(toHaveNoViolations);

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { toast } from "sonner";

const APPLICATION_ID = "a1111111-1111-4111-a111-111111111111";

function makeNote(overrides: Partial<ApplicationNote> = {}): ApplicationNote {
  return {
    id: "note-1",
    applicationId: APPLICATION_ID,
    authorUserId: "user-1",
    authorName: "Amaka Okonkwo",
    content: "Strong candidate, schedule follow-up.",
    createdAt: new Date("2026-04-12T10:00:00.000Z"),
    ...overrides,
  };
}

function mockFetch(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NotesSection", () => {
  it("renders heading and existing notes in chronological order", () => {
    const notes = [
      makeNote({
        id: "note-1",
        content: "First impression positive.",
        createdAt: new Date("2026-04-10T09:00:00.000Z"),
      }),
      makeNote({
        id: "note-2",
        content: "Reference check passed.",
        createdAt: new Date("2026-04-11T09:00:00.000Z"),
      }),
    ];
    renderWithPortalProviders(<NotesSection applicationId={APPLICATION_ID} initialNotes={notes} />);
    expect(screen.getByRole("heading", { name: /notes/i })).toBeInTheDocument();
    const items = screen.getAllByTestId("note-item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("First impression positive.");
    expect(items[1]).toHaveTextContent("Reference check passed.");
  });

  it("renders empty state when no notes exist", () => {
    renderWithPortalProviders(<NotesSection applicationId={APPLICATION_ID} initialNotes={[]} />);
    expect(screen.getByText(/No notes yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId("note-item")).not.toBeInTheDocument();
  });

  it("shows author name from the note", () => {
    renderWithPortalProviders(
      <NotesSection
        applicationId={APPLICATION_ID}
        initialNotes={[makeNote({ authorName: "Chidi Eze" })]}
      />,
    );
    expect(screen.getByText("Chidi Eze")).toBeInTheDocument();
  });

  it("falls back to Unknown when authorName is null", () => {
    renderWithPortalProviders(
      <NotesSection
        applicationId={APPLICATION_ID}
        initialNotes={[makeNote({ authorName: null })]}
      />,
    );
    expect(screen.getByText(/Unknown/i)).toBeInTheDocument();
  });

  it("disables save button when content is empty", () => {
    renderWithPortalProviders(<NotesSection applicationId={APPLICATION_ID} initialNotes={[]} />);
    const btn = screen.getByRole("button", { name: /save note/i });
    expect(btn).toBeDisabled();
  });

  it("updates character counter as user types", async () => {
    const user = userEvent.setup();
    renderWithPortalProviders(<NotesSection applicationId={APPLICATION_ID} initialNotes={[]} />);
    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "Hello");
    expect(screen.getByTestId("notes-char-count")).toHaveTextContent("5/2000"); // via Portal.ats.notes.maxLength key
  });

  it("submits note and optimistically appends result on success", async () => {
    const newNote = makeNote({
      id: "note-new",
      content: "Newly added note.",
      createdAt: new Date("2026-04-12T12:00:00.000Z"),
    });
    mockFetch(201, { data: newNote });
    const user = userEvent.setup();

    renderWithPortalProviders(<NotesSection applicationId={APPLICATION_ID} initialNotes={[]} />);

    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "Newly added note.");
    await user.click(screen.getByRole("button", { name: /save note/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/v1/applications/${APPLICATION_ID}/notes`,
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Newly added note." }),
        }),
      );
      expect(toast.success).toHaveBeenCalled();
    });

    const items = await screen.findAllByTestId("note-item");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("Newly added note.");
    // Textarea should be cleared after save
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("shows error toast and preserves content when save fails", async () => {
    mockFetch(500, { title: "Internal Server Error" });
    const user = userEvent.setup();

    renderWithPortalProviders(<NotesSection applicationId={APPLICATION_ID} initialNotes={[]} />);

    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "Will fail.");
    await user.click(screen.getByRole("button", { name: /save note/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    expect(screen.getByRole("textbox")).toHaveValue("Will fail.");
    expect(screen.queryByTestId("note-item")).not.toBeInTheDocument();
  });

  it("trims whitespace from submitted content", async () => {
    const newNote = makeNote({ content: "Trimmed content" });
    mockFetch(201, { data: newNote });
    const user = userEvent.setup();

    renderWithPortalProviders(<NotesSection applicationId={APPLICATION_ID} initialNotes={[]} />);

    const textarea = screen.getByRole("textbox");
    await user.type(textarea, "   Trimmed content   ");
    await user.click(screen.getByRole("button", { name: /save note/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ content: "Trimmed content" }),
        }),
      );
    });
  });

  it("enforces maxLength of 2000 characters on textarea", () => {
    renderWithPortalProviders(<NotesSection applicationId={APPLICATION_ID} initialNotes={[]} />);
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.maxLength).toBe(2000);
  });

  it("passes accessibility check with notes present", async () => {
    const { container } = renderWithPortalProviders(
      <NotesSection applicationId={APPLICATION_ID} initialNotes={[makeNote()]} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("passes accessibility check in empty state", async () => {
    const { container } = renderWithPortalProviders(
      <NotesSection applicationId={APPLICATION_ID} initialNotes={[]} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
