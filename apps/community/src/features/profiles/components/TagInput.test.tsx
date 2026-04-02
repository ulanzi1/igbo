// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@/test/test-utils";
import { TagInput } from "./TagInput";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TagInput", () => {
  it("renders label and input", () => {
    render(<TagInput id="tags" label="Tags" values={[]} onChange={vi.fn()} />);

    expect(screen.getByLabelText("Tags")).toBeInTheDocument();
  });

  it("displays existing tags", () => {
    render(<TagInput id="tags" label="Tags" values={["React", "TypeScript"]} onChange={vi.fn()} />);

    expect(screen.getByText("React")).toBeInTheDocument();
    expect(screen.getByText("TypeScript")).toBeInTheDocument();
  });

  it("adds tag on Enter key", () => {
    const onChange = vi.fn();
    render(<TagInput id="tags" label="Tags" values={["React"]} onChange={onChange} />);

    const input = screen.getByLabelText("Tags");
    fireEvent.change(input, { target: { value: "Vue" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith(["React", "Vue"]);
  });

  it("adds tag on comma key", () => {
    const onChange = vi.fn();
    render(<TagInput id="tags" label="Tags" values={[]} onChange={onChange} />);

    const input = screen.getByLabelText("Tags");
    fireEvent.change(input, { target: { value: "Svelte" } });
    fireEvent.keyDown(input, { key: "," });

    expect(onChange).toHaveBeenCalledWith(["Svelte"]);
  });

  it("adds tag on blur", () => {
    const onChange = vi.fn();
    render(<TagInput id="tags" label="Tags" values={[]} onChange={onChange} />);

    const input = screen.getByLabelText("Tags");
    fireEvent.change(input, { target: { value: "Angular" } });
    fireEvent.blur(input);

    expect(onChange).toHaveBeenCalledWith(["Angular"]);
  });

  it("does not add duplicate tags", () => {
    const onChange = vi.fn();
    render(<TagInput id="tags" label="Tags" values={["React"]} onChange={onChange} />);

    const input = screen.getByLabelText("Tags");
    fireEvent.change(input, { target: { value: "React" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not add empty/whitespace tags", () => {
    const onChange = vi.fn();
    render(<TagInput id="tags" label="Tags" values={[]} onChange={onChange} />);

    const input = screen.getByLabelText("Tags");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes tag via remove button", () => {
    const onChange = vi.fn();
    render(<TagInput id="tags" label="Tags" values={["React", "Vue"]} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove React" }));

    expect(onChange).toHaveBeenCalledWith(["Vue"]);
  });

  it("removes last tag on Backspace when input is empty", () => {
    const onChange = vi.fn();
    render(<TagInput id="tags" label="Tags" values={["React", "Vue"]} onChange={onChange} />);

    const input = screen.getByLabelText("Tags");
    fireEvent.keyDown(input, { key: "Backspace" });

    expect(onChange).toHaveBeenCalledWith(["React"]);
  });

  it("does not remove tag on Backspace when input has text", () => {
    const onChange = vi.fn();
    render(<TagInput id="tags" label="Tags" values={["React"]} onChange={onChange} />);

    const input = screen.getByLabelText("Tags");
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.keyDown(input, { key: "Backspace" });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("respects maxItems limit", () => {
    const onChange = vi.fn();
    render(
      <TagInput id="tags" label="Tags" values={["a", "b"]} onChange={onChange} maxItems={2} />,
    );

    const input = screen.getByLabelText("Tags");
    fireEvent.change(input, { target: { value: "c" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows hint text when provided", () => {
    render(
      <TagInput id="tags" label="Tags" values={[]} onChange={vi.fn()} hint="Press Enter to add" />,
    );

    expect(screen.getByText("Press Enter to add")).toBeInTheDocument();
  });

  it("shows placeholder only when values are empty", () => {
    const { rerender } = render(
      <TagInput id="tags" label="Tags" values={[]} onChange={vi.fn()} placeholder="Add tags..." />,
    );

    expect(screen.getByPlaceholderText("Add tags...")).toBeInTheDocument();

    rerender(
      <TagInput
        id="tags"
        label="Tags"
        values={["React"]}
        onChange={vi.fn()}
        placeholder="Add tags..."
      />,
    );

    expect(screen.queryByPlaceholderText("Add tags...")).not.toBeInTheDocument();
  });
});
