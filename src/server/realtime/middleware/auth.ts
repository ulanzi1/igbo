// NOTE: No "server-only" import — this runs as standalone Node.js, not inside Next.js
import type { Socket } from "socket.io";
import { jwtVerify } from "jose";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { authUsers } from "@/db/schema/auth-users";

const AUTH_SECRET = process.env.AUTH_SECRET;

/**
 * Socket.IO authentication middleware.
 * Verifies the Auth.js JWT directly using AUTH_SECRET.
 * Extracts userId from the JWT payload and attaches to socket.data.
 * Rejects suspended or banned users.
 *
 * MUST always call next() — Socket.IO middleware contract.
 */
export async function authMiddleware(socket: Socket, next: (err?: Error) => void): Promise<void> {
  try {
    const token = (socket.handshake.auth as Record<string, unknown>)?.token as string | undefined;

    if (!token || typeof token !== "string") {
      next(new Error("UNAUTHORIZED: missing session token"));
      return;
    }

    if (!AUTH_SECRET) {
      next(new Error("UNAUTHORIZED: AUTH_SECRET not configured"));
      return;
    }

    // Verify the Auth.js JWT using the same secret
    const secret = new TextEncoder().encode(AUTH_SECRET);
    const { payload } = await jwtVerify(token, secret);

    const userId = payload.id as string | undefined;
    if (!userId) {
      next(new Error("UNAUTHORIZED: JWT missing user id"));
      return;
    }

    // Authoritative DB status check — reject suspended or banned users
    // Direct query avoids importing server-only-guarded auth-queries.ts
    const [user] = await db
      .select({ accountStatus: authUsers.accountStatus })
      .from(authUsers)
      .where(and(eq(authUsers.id, userId), isNull(authUsers.deletedAt)))
      .limit(1);
    if (user?.accountStatus === "BANNED") {
      next(new Error("UNAUTHORIZED: account banned"));
      return;
    }
    if (user?.accountStatus === "SUSPENDED") {
      next(new Error("UNAUTHORIZED: account suspended"));
      return;
    }

    // Attach userId so namespace handlers can access it
    socket.data.userId = userId;
    next();
  } catch (err: unknown) {
    next(
      new Error(
        `UNAUTHORIZED: session validation failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }
}
