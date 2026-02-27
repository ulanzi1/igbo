// NOTE: No "server-only" import — this runs as standalone Node.js, not inside Next.js
import type { Socket } from "socket.io";
import { jwtVerify } from "jose";

const AUTH_SECRET = process.env.AUTH_SECRET;

/**
 * Socket.IO authentication middleware.
 * Verifies the Auth.js JWT directly using AUTH_SECRET.
 * Extracts userId from the JWT payload and attaches to socket.data.
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
