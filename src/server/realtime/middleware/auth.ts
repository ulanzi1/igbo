// NOTE: No "server-only" import — this runs as standalone Node.js, not inside Next.js
import type { Socket } from "socket.io";
import { getCachedSession } from "@/server/auth/redis-session-cache";

/**
 * Socket.IO authentication middleware.
 * Extracts the session token from the handshake, validates it via Redis,
 * and attaches userId to socket.data.
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

    const session = await getCachedSession(token);

    if (!session) {
      next(new Error("UNAUTHORIZED: invalid or expired session"));
      return;
    }

    // Check session expiry
    if (session.expires < new Date()) {
      next(new Error("UNAUTHORIZED: session expired"));
      return;
    }

    // Attach userId so namespace handlers can access it
    socket.data.userId = session.userId;
    next();
  } catch (err: unknown) {
    next(
      new Error(
        `UNAUTHORIZED: session validation failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }
}
