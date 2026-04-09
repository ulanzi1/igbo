// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { SeekerProfileViewTracker } from "./seeker-profile-view-tracker";

const SEEKER_PROFILE_ID = "11111111-1111-1111-1111-111111111111";
const VIEWER_USER_ID = "22222222-2222-2222-2222-222222222222";
const PROFILE_OWNER_USER_ID = "33333333-3333-3333-3333-333333333333";

let fetchCalls: { url: string; options: RequestInit }[] = [];

beforeEach(() => {
  fetchCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, options: RequestInit) => {
      fetchCalls.push({ url, options });
      return Promise.resolve(new Response(JSON.stringify({ data: { recorded: true } })));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SeekerProfileViewTracker", () => {
  it("fires a POST request to the view endpoint on mount", async () => {
    render(
      <SeekerProfileViewTracker
        seekerProfileId={SEEKER_PROFILE_ID}
        viewerUserId={VIEWER_USER_ID}
        profileOwnerUserId={PROFILE_OWNER_USER_ID}
      />,
    );

    // Allow microtask queue to flush
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]!.url).toBe(`/api/v1/seekers/${SEEKER_PROFILE_ID}/view`);
    expect(fetchCalls[0]!.options.method).toBe("POST");
    // The browser sets `Origin` automatically for same-origin POST; we must
    // not set it manually (forbidden header — would be silently stripped).
    expect(fetchCalls[0]!.options.headers).toBeUndefined();
  });

  it("does NOT fetch when viewer is the profile owner (self-view)", async () => {
    render(
      <SeekerProfileViewTracker
        seekerProfileId={SEEKER_PROFILE_ID}
        viewerUserId={PROFILE_OWNER_USER_ID}
        profileOwnerUserId={PROFILE_OWNER_USER_ID}
      />,
    );

    await new Promise((r) => setTimeout(r, 0));

    expect(fetchCalls).toHaveLength(0);
  });

  it("renders null — no DOM output", () => {
    const { container } = render(
      <SeekerProfileViewTracker
        seekerProfileId={SEEKER_PROFILE_ID}
        viewerUserId={VIEWER_USER_ID}
        profileOwnerUserId={PROFILE_OWNER_USER_ID}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
