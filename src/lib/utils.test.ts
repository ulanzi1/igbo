import { cn } from "./utils";

describe("cn utility", () => {
  it("merges class names into a single string", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("filters out falsy conditional classes", () => {
    expect(cn("foo", false && "bar", "baz")).toBe("foo baz");
  });

  it("handles undefined and null values without throwing", () => {
    expect(cn("foo", undefined, null, "bar")).toBe("foo bar");
  });

  it("resolves Tailwind class conflicts keeping the last value", () => {
    expect(cn("p-4", "p-8")).toBe("p-8");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("handles array inputs", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar");
  });
});
