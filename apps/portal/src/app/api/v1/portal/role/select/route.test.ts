// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@igbo/auth", () => ({ auth: vi.fn() }));
vi.mock("@igbo/db/queries/auth-permissions", () => ({
  getRoleByName: vi.fn(),
  assignUserRole: vi.fn(),
  getUserPortalRoles: vi.fn().mockResolvedValue([]),
}));

import { auth } from "@igbo/auth";
import {
  getRoleByName,
  assignUserRole,
  getUserPortalRoles,
} from "@igbo/db/queries/auth-permissions";
import { POST } from "./route";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const mockGetRoleByName = getRoleByName as unknown as ReturnType<typeof vi.fn>;
const mockAssignUserRole = assignUserRole as unknown as ReturnType<typeof vi.fn>;
const mockGetUserPortalRoles = getUserPortalRoles as unknown as ReturnType<typeof vi.fn>;

const employerRoleRow = { id: "role-employer-uuid", name: "EMPLOYER" };
const seekerRoleRow = { id: "role-seeker-uuid", name: "JOB_SEEKER" };

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/portal/role/select", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost",
      Host: "localhost",
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: "user-123" } });
  // Default: no existing roles before assignment, then assigned role present after
  mockGetUserPortalRoles.mockResolvedValue([]);
  mockAssignUserRole.mockResolvedValue(undefined);
});

describe("POST /api/v1/portal/role/select", () => {
  it("assigns EMPLOYER role and returns 201", async () => {
    mockGetRoleByName.mockResolvedValue(employerRoleRow);
    // post-write read returns the assigned role
    mockGetUserPortalRoles
      .mockResolvedValueOnce([]) // pre-write guard
      .mockResolvedValueOnce(["EMPLOYER"]); // post-write verify

    const res = await POST(makeRequest({ role: "EMPLOYER" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.role).toBe("EMPLOYER");
    expect(body.data.activePortalRole).toBe("EMPLOYER");
    expect(mockAssignUserRole).toHaveBeenCalledWith("user-123", employerRoleRow.id);
  });

  it("assigns JOB_SEEKER role and returns 201", async () => {
    mockGetRoleByName.mockResolvedValue(seekerRoleRow);
    mockGetUserPortalRoles.mockResolvedValueOnce([]).mockResolvedValueOnce(["JOB_SEEKER"]);

    const res = await POST(makeRequest({ role: "JOB_SEEKER" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.role).toBe("JOB_SEEKER");
    expect(mockAssignUserRole).toHaveBeenCalledWith("user-123", seekerRoleRow.id);
  });

  it("returns 409 when user already has any portal role (pre-write guard)", async () => {
    mockGetUserPortalRoles.mockResolvedValue(["EMPLOYER"]);

    const res = await POST(makeRequest({ role: "EMPLOYER" }));
    expect(res.status).toBe(409);
    // no role detail in response body (privacy — does not expose existing roles)
    const body = await res.json();
    expect(body.existingRoles).toBeUndefined();
  });

  it("returns 409 on dual-tab race (concurrent request assigned a different role)", async () => {
    mockGetRoleByName.mockResolvedValue(employerRoleRow);
    mockGetUserPortalRoles
      .mockResolvedValueOnce([]) // pre-write guard passes (race window)
      .mockResolvedValueOnce(["JOB_SEEKER"]); // post-write read: different role won

    const res = await POST(makeRequest({ role: "EMPLOYER" }));
    expect(res.status).toBe(409);
  });

  it("returns 400 for invalid role name", async () => {
    const res = await POST(makeRequest({ role: "INVALID" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for JOB_ADMIN (not self-service)", async () => {
    const res = await POST(makeRequest({ role: "JOB_ADMIN" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 for unauthenticated request", async () => {
    mockAuth.mockResolvedValue(null);

    const res = await POST(makeRequest({ role: "EMPLOYER" }));
    expect(res.status).toBe(401);
  });
});
