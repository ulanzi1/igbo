// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock("@/services/event-bus", () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock("@/services/email-service", () => ({
  emailService: { send: vi.fn().mockResolvedValue(undefined) },
  enqueueEmailJob: vi.fn(),
}));

const mockFindUserByEmail = vi.fn();
const mockCreateUser = vi.fn();
const mockCreateVerificationToken = vi.fn();

vi.mock("@/db/queries/auth-queries", () => ({
  findUserByEmail: (...args: unknown[]) => mockFindUserByEmail(...args),
  createUser: (...args: unknown[]) => mockCreateUser(...args),
  createVerificationToken: (...args: unknown[]) => mockCreateVerificationToken(...args),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (key: string) => {
      if (key === "CF-Connecting-IP") return "1.2.3.4";
      return null;
    },
  }),
}));

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_APP_URL: "https://obigbo.example.com" },
}));

import { submitApplication } from "./submit-application";
import { eventBus } from "@/services/event-bus";

const validValues = {
  name: "Chukwuemeka Obi",
  email: "chukwu@example.com",
  phone: "",
  locationCity: "Lagos",
  locationState: "Lagos State",
  locationCountry: "Nigeria",
  culturalConnection: "I am Igbo from Anambra State",
  reasonForJoining: "I want to connect with my community",
  referralName: "",
  consentGiven: true as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFindUserByEmail.mockResolvedValue(null);
  mockCreateUser.mockResolvedValue({
    id: "user-uuid-1",
    email: "chukwu@example.com",
    name: "Chukwuemeka Obi",
  });
  mockCreateVerificationToken.mockResolvedValue({ id: "token-uuid-1" });
});

describe("submitApplication", () => {
  it("returns success for valid input", async () => {
    const result = await submitApplication(validValues);
    expect(result.success).toBe(true);
  });

  it("creates user record in DB", async () => {
    await submitApplication(validValues);
    expect(mockCreateUser).toHaveBeenCalledOnce();
    const args = mockCreateUser.mock.calls[0][0];
    expect(args.email).toBe("chukwu@example.com");
    expect(args.accountStatus).toBe("PENDING_EMAIL_VERIFICATION");
    expect(args.consentGivenAt).toBeInstanceOf(Date);
    expect(args.consentVersion).toBe("1.0");
  });

  it("creates verification token in DB", async () => {
    await submitApplication(validValues);
    expect(mockCreateVerificationToken).toHaveBeenCalledOnce();
    const args = mockCreateVerificationToken.mock.calls[0][0];
    expect(args.userId).toBe("user-uuid-1");
    expect(args.tokenHash).toBeTruthy();
    expect(args.expiresAt).toBeInstanceOf(Date);
    // Token should expire ~24h in the future
    const diff = args.expiresAt.getTime() - Date.now();
    expect(diff).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(diff).toBeLessThan(25 * 60 * 60 * 1000);
  });

  it("emits user.applied event after successful submission", async () => {
    await submitApplication(validValues);
    expect(eventBus.emit).toHaveBeenCalledWith(
      "user.applied",
      expect.objectContaining({ userId: "user-uuid-1" }),
    );
  });

  it("returns field-level error for duplicate email", async () => {
    mockFindUserByEmail.mockResolvedValue({ id: "existing-user", email: "chukwu@example.com" });
    const result = await submitApplication(validValues);
    expect(result.success).toBe(false);
    if (!result.success && "field" in result.error) {
      expect(result.error.field).toBe("email");
      expect(result.error.message).toBe("An application with this email address already exists");
    } else {
      throw new Error("Expected field-level error");
    }
  });

  it("does NOT call createUser for duplicate email", async () => {
    mockFindUserByEmail.mockResolvedValue({ id: "existing-user", email: "chukwu@example.com" });
    await submitApplication(validValues);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("returns validation error for missing name", async () => {
    const result = await submitApplication({ ...validValues, name: "" });
    expect(result.success).toBe(false);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("returns validation error for invalid email", async () => {
    const result = await submitApplication({ ...validValues, email: "not-an-email" });
    expect(result.success).toBe(false);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("accepts valid E.164 phone number", async () => {
    const result = await submitApplication({ ...validValues, phone: "+2348012345678" });
    expect(result.success).toBe(true);
  });

  it("returns validation error for invalid phone format", async () => {
    const result = await submitApplication({ ...validValues, phone: "08012345678" });
    expect(result.success).toBe(false);
  });

  it("stores IP address from CF-Connecting-IP header", async () => {
    await submitApplication(validValues);
    const args = mockCreateUser.mock.calls[0][0];
    expect(args.consentIp).toBe("1.2.3.4");
  });
});
