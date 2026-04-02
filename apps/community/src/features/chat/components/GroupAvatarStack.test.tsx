import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("@/lib/utils", () => ({ cn: (...args: unknown[]) => args.filter(Boolean).join(" ") }));

import { GroupAvatarStack } from "./GroupAvatarStack";

const members = [
  { id: "u1", displayName: "Ada Okonkwo", photoUrl: null },
  { id: "u2", displayName: "Chidi Okeke", photoUrl: null },
  { id: "u3", displayName: "Ngozi Adichie", photoUrl: null },
  { id: "u4", displayName: "Emeka Eze", photoUrl: null }, // 4th — should be clipped to 3
];

describe("GroupAvatarStack", () => {
  it("renders initials for members without photos", () => {
    render(<GroupAvatarStack members={members.slice(0, 2)} />);
    expect(screen.getByText("A")).toBeInTheDocument(); // Ada
    expect(screen.getByText("C")).toBeInTheDocument(); // Chidi
  });

  it("renders at most 3 avatars even when more members are provided", () => {
    render(<GroupAvatarStack members={members} />);
    // Only 3 initials should appear: A, C, N (4th is clipped)
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
    expect(screen.getByText("N")).toBeInTheDocument();
    expect(screen.queryByText("E")).not.toBeInTheDocument();
  });

  it("renders img when photoUrl is provided", () => {
    const withPhoto = [{ id: "u1", displayName: "Ada", photoUrl: "https://example.com/ada.jpg" }];
    render(<GroupAvatarStack members={withPhoto} />);
    const img = screen.getByRole("img", { name: "Ada" });
    expect(img).toHaveAttribute("src", "https://example.com/ada.jpg");
  });

  it("applies sm size classes by default", () => {
    const { container } = render(<GroupAvatarStack members={members.slice(0, 1)} />);
    // container > outer div (GroupAvatarStack wrapper) > inner div (avatar)
    const avatar = container.querySelector("div > div > div");
    expect(avatar?.className).toContain("h-6");
    expect(avatar?.className).toContain("w-6");
  });

  it("applies md size classes when size=md", () => {
    const { container } = render(<GroupAvatarStack members={members.slice(0, 1)} size="md" />);
    const avatar = container.querySelector("div > div > div");
    expect(avatar?.className).toContain("h-8");
    expect(avatar?.className).toContain("w-8");
  });

  it("passes className to wrapper div", () => {
    const { container } = render(
      <GroupAvatarStack members={members.slice(0, 1)} className="extra-class" />,
    );
    expect(container.firstChild).toHaveAttribute("class", expect.stringContaining("extra-class"));
  });

  it("has role=group and aria-label with all member names for a11y", () => {
    render(<GroupAvatarStack members={members.slice(0, 3)} />);
    const wrapper = screen.getByRole("group");
    expect(wrapper).toHaveAttribute("aria-label", "Ada Okonkwo, Chidi Okeke, Ngozi Adichie");
  });
});
