import { describe, it, expect } from "vitest";
import { createRedisKey } from "./redis";

describe("createRedisKey", () => {
  it("creates a community-namespaced key", () => {
    expect(createRedisKey("community", "session", "abc")).toBe("community:session:abc");
  });

  it("creates a portal-namespaced key", () => {
    expect(createRedisKey("portal", "session", "abc")).toBe("portal:session:abc");
  });

  it("isolates namespaces — same domain+id, different app", () => {
    const communityKey = createRedisKey("community", "session", "user-123");
    const portalKey = createRedisKey("portal", "session", "user-123");
    expect(communityKey).not.toBe(portalKey);
    expect(communityKey).toBe("community:session:user-123");
    expect(portalKey).toBe("portal:session:user-123");
  });

  it("handles composite IDs", () => {
    expect(createRedisKey("community", "typing", "conv-1:user-2")).toBe(
      "community:typing:conv-1:user-2",
    );
  });
});
