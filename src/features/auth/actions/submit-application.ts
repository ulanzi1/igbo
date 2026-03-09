"use server";
import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { eventBus } from "@/services/event-bus";
import { enqueueEmailJob } from "@/services/email-service";
import { createUser, createVerificationToken, findUserByEmail } from "@/db/queries/auth-queries";
import { env } from "@/env";
import type {
  ApplicationActionResult,
  ApplicationFormValues,
} from "@/features/auth/types/application";

const E164_REGEX = /^\+[1-9]\d{1,14}$/;
const CONSENT_VERSION = "1.0";

const submitApplicationSchema = z.object({
  name: z.string().min(1, "Full name is required").max(255),
  email: z.string().email("Please enter a valid email address").max(255),
  phone: z
    .string()
    .regex(E164_REGEX, "Please enter a valid phone number with country code")
    .optional()
    .or(z.literal("")),
  locationCity: z.string().min(1, "City is required").max(255),
  locationState: z.string().max(255).optional().or(z.literal("")),
  locationCountry: z.string().min(1, "Country is required").max(255),
  culturalConnection: z
    .string()
    .min(1, "Please describe your cultural connection")
    .max(2000, "Maximum 2000 characters"),
  reasonForJoining: z
    .string()
    .min(10, "Please provide more detail (minimum 10 characters)")
    .max(2000, "Maximum 2000 characters"),
  referralName: z.string().max(255).optional().or(z.literal("")),
  consentGiven: z.literal(true, {
    error: "You must consent to the Privacy Policy to submit your application",
  }),
});

function getClientIp(headersList: Awaited<ReturnType<typeof headers>>): string {
  return (
    headersList.get("CF-Connecting-IP") ??
    headersList.get("X-Client-IP") ??
    headersList.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    ""
  );
}

export async function submitApplication(
  values: ApplicationFormValues,
): Promise<ApplicationActionResult> {
  // Server-side validation
  const parsed = submitApplicationSchema.safeParse(values);
  if (!parsed.success) {
    const issues = parsed.error.issues ?? [];
    const firstError = issues[0];
    return {
      success: false,
      error: {
        field: firstError?.path.join(".") ?? "form",
        message: firstError?.message ?? "Validation error",
      },
    };
  }

  const data = parsed.data;
  const normalizedEmail = data.email.toLowerCase();
  const headersList = await headers();
  const clientIp = getClientIp(headersList);

  // Check for duplicate email or banned email
  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    if (existing.accountStatus === "BANNED") {
      return {
        success: false,
        error: {
          field: "email",
          message: "This email address is not eligible for registration",
        },
      };
    }
    return {
      success: false,
      error: {
        field: "email",
        message: "An application with this email address already exists",
      },
    };
  }

  // Create user record (email normalized to lowercase for case-insensitive matching)
  let user;
  try {
    user = await createUser({
      email: normalizedEmail,
      name: data.name,
      phone: data.phone || null,
      locationCity: data.locationCity || null,
      locationState: data.locationState || null,
      locationCountry: data.locationCountry || null,
      culturalConnection: data.culturalConnection,
      reasonForJoining: data.reasonForJoining,
      referralName: data.referralName || null,
      consentGivenAt: new Date(),
      consentIp: clientIp || null,
      consentVersion: CONSENT_VERSION,
      accountStatus: "PENDING_EMAIL_VERIFICATION",
    });
  } catch (err: unknown) {
    // Handle unique constraint violation (race condition: concurrent insert with same email)
    const pgError = err as { code?: string };
    if (pgError.code === "23505") {
      return {
        success: false,
        error: {
          field: "email",
          message: "An application with this email address already exists",
        },
      };
    }
    throw err;
  }

  if (!user) {
    return {
      success: false,
      error: { message: "Failed to create application. Please try again." },
    };
  }

  // Generate verification token
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await createVerificationToken({ userId: user.id, tokenHash, expiresAt });

  const verifyUrl = `${env.NEXT_PUBLIC_APP_URL}/api/v1/auth/verify-email?token=${rawToken}&userId=${user.id}`;

  // Enqueue email job (non-blocking)
  enqueueEmailJob(`email-verify-${user.id}`, {
    to: user.email,
    subject: "Verify your OBIGBO email address",
    templateId: "email-verification",
    data: { name: user.name ?? user.email, verifyUrl },
  });

  // Emit domain event
  eventBus.emit("user.applied", { userId: user.id, timestamp: new Date().toISOString() });

  return { success: true };
}
