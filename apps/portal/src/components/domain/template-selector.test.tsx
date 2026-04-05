import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { TemplateSelector } from "./template-selector";
import { JOB_TEMPLATES } from "@/lib/job-templates";

const messages = {
  Portal: {
    templates: {
      useTemplate: "Use Template",
      selectTemplate: "Select a Template",
      selectDescription: "Choose a role template to pre-fill the form",
      softwareEngineer: "Software Engineer",
      marketingManager: "Marketing Manager",
      salesRepresentative: "Sales Representative",
      customerSupport: "Customer Support",
      administrativeAssistant: "Administrative Assistant",
    },
  },
};

function renderSelector(onSelect = vi.fn(), disabled = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TemplateSelector onSelect={onSelect} disabled={disabled} />
    </NextIntlClientProvider>,
  );
}

describe("TemplateSelector", () => {
  it("renders the Use Template button", () => {
    renderSelector();
    expect(screen.getByTestId("use-template-button")).toBeInTheDocument();
    expect(screen.getByText("Use Template")).toBeInTheDocument();
  });

  it("dropdown is hidden initially", () => {
    renderSelector();
    expect(screen.queryByTestId("template-dropdown")).not.toBeInTheDocument();
  });

  it("opens dropdown when button is clicked", async () => {
    const user = userEvent.setup();
    renderSelector();
    await user.click(screen.getByTestId("use-template-button"));
    expect(screen.getByTestId("template-dropdown")).toBeInTheDocument();
    expect(screen.getByText("Software Engineer")).toBeInTheDocument();
    expect(screen.getByText("Marketing Manager")).toBeInTheDocument();
  });

  it("renders all 5 template options when open", async () => {
    const user = userEvent.setup();
    renderSelector();
    await user.click(screen.getByTestId("use-template-button"));
    for (const template of JOB_TEMPLATES) {
      expect(screen.getByTestId(`template-option-${template.id}`)).toBeInTheDocument();
    }
  });

  it("calls onSelect with the correct template when an option is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderSelector(onSelect);
    await user.click(screen.getByTestId("use-template-button"));
    await user.click(screen.getByTestId("template-option-software-engineer"));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "software-engineer", title: "Software Engineer" }),
    );
  });

  it("closes dropdown after selecting a template", async () => {
    const user = userEvent.setup();
    renderSelector();
    await user.click(screen.getByTestId("use-template-button"));
    expect(screen.getByTestId("template-dropdown")).toBeInTheDocument();
    await user.click(screen.getByTestId("template-option-marketing-manager"));
    expect(screen.queryByTestId("template-dropdown")).not.toBeInTheDocument();
  });

  it("button is disabled when disabled prop is true", () => {
    renderSelector(vi.fn(), true);
    expect(screen.getByTestId("use-template-button")).toBeDisabled();
  });

  it("closes dropdown when Escape key is pressed", async () => {
    const user = userEvent.setup();
    renderSelector();
    await user.click(screen.getByTestId("use-template-button"));
    expect(screen.getByTestId("template-dropdown")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("template-dropdown")).not.toBeInTheDocument();
  });

  it("has correct ARIA attributes (haspopup, expanded)", async () => {
    const user = userEvent.setup();
    renderSelector();
    const btn = screen.getByTestId("use-template-button");
    expect(btn.getAttribute("aria-haspopup")).toBe("listbox");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    await user.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });
});
