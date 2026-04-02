// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GroupCreationForm } from "./GroupCreationForm";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/shared/FileUpload", () => ({
  FileUpload: () => <div data-testid="file-upload">FileUpload</div>,
}));

vi.mock("@/features/groups/actions/create-group", () => ({
  createGroupAction: vi.fn(),
}));

import { createGroupAction } from "@/features/groups/actions/create-group";

const mockCreateGroupAction = vi.mocked(createGroupAction);

beforeEach(() => {
  mockCreateGroupAction.mockReset();
  mockCreateGroupAction.mockResolvedValue({ groupId: "00000000-0000-4000-8000-000000000001" });
});

describe("GroupCreationForm", () => {
  describe("when canCreate=false", () => {
    it("renders upgrade prompt", () => {
      render(<GroupCreationForm canCreate={false} />);
      expect(screen.getByText("upgradePrompt")).toBeInTheDocument();
    });

    it("does not render the creation form", () => {
      render(<GroupCreationForm canCreate={false} />);
      expect(screen.queryByLabelText("form.name")).not.toBeInTheDocument();
    });
  });

  describe("when canCreate=true", () => {
    it("renders the creation form", () => {
      render(<GroupCreationForm canCreate />);
      expect(screen.getByLabelText(/form\.name/)).toBeInTheDocument();
    });

    it("renders file upload for banner", () => {
      render(<GroupCreationForm canCreate />);
      expect(screen.getByTestId("file-upload")).toBeInTheDocument();
    });

    it("renders all required form fields", () => {
      render(<GroupCreationForm canCreate />);
      expect(screen.getByLabelText(/form\.name/)).toBeInTheDocument();
      expect(screen.getByLabelText(/form\.description/)).toBeInTheDocument();
      expect(screen.getByLabelText(/form\.visibility/)).toBeInTheDocument();
      expect(screen.getByLabelText(/form\.joinType/)).toBeInTheDocument();
      expect(screen.getByLabelText(/form\.postingPermission/)).toBeInTheDocument();
      expect(screen.getByLabelText(/form\.commentingPermission/)).toBeInTheDocument();
    });

    it("submit button is disabled when name is empty", () => {
      render(<GroupCreationForm canCreate />);
      const submitBtn = screen.getByRole("button", { name: /form\.submit/ });
      expect(submitBtn).toBeDisabled();
    });

    it("submit button is enabled when name is filled", async () => {
      render(<GroupCreationForm canCreate />);
      const nameInput = screen.getByLabelText(/form\.name/);
      fireEvent.change(nameInput, { target: { value: "London Chapter" } });
      const submitBtn = screen.getByRole("button", { name: /form\.submit/ });
      expect(submitBtn).not.toBeDisabled();
    });

    it("calls createGroupAction on submit", async () => {
      render(<GroupCreationForm canCreate />);
      const nameInput = screen.getByLabelText(/form\.name/);
      fireEvent.change(nameInput, { target: { value: "London Chapter" } });
      const form = screen.getByRole("button", { name: /form\.submit/ }).closest("form");
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(mockCreateGroupAction).toHaveBeenCalledWith(
          expect.objectContaining({ name: "London Chapter" }),
        );
      });
    });

    it("shows error message when server action returns errorCode", async () => {
      mockCreateGroupAction.mockResolvedValue({
        errorCode: "PERMISSION_DENIED",
        reason: "Not allowed",
      });

      render(<GroupCreationForm canCreate />);
      const nameInput = screen.getByLabelText(/form\.name/);
      fireEvent.change(nameInput, { target: { value: "Test Group" } });
      const form = screen.getByRole("button", { name: /form\.submit/ }).closest("form");
      fireEvent.submit(form!);

      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent("Not allowed");
      });
    });
  });
});
