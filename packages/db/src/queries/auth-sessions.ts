import "server-only";
import { eq, and, gt, asc } from "drizzle-orm";
import { db } from "../index";
import { authSessions } from "../schema/auth-sessions";
import type { NewAuthSession } from "../schema/auth-sessions";

export async function createSession(data: NewAuthSession) {
  const [session] = await db.insert(authSessions).values(data).returning();
  return session ?? null;
}

export async function findSessionByToken(sessionToken: string) {
  const [session] = await db
    .select()
    .from(authSessions)
    .where(eq(authSessions.sessionToken, sessionToken))
    .limit(1);
  return session ?? null;
}

export async function findSessionById(id: string) {
  const [session] = await db.select().from(authSessions).where(eq(authSessions.id, id)).limit(1);
  return session ?? null;
}

export async function findActiveSessionsByUserId(userId: string) {
  const now = new Date();
  return db
    .select()
    .from(authSessions)
    .where(and(eq(authSessions.userId, userId), gt(authSessions.expires, now)))
    .orderBy(asc(authSessions.createdAt));
}

export async function deleteSessionByToken(sessionToken: string) {
  await db.delete(authSessions).where(eq(authSessions.sessionToken, sessionToken));
}

export async function deleteSessionById(id: string, userId: string) {
  await db
    .delete(authSessions)
    .where(and(eq(authSessions.id, id), eq(authSessions.userId, userId)));
}

export async function deleteOldestSessionForUser(userId: string) {
  const sessions = await db
    .select({ id: authSessions.id, sessionToken: authSessions.sessionToken })
    .from(authSessions)
    .where(eq(authSessions.userId, userId))
    .orderBy(asc(authSessions.createdAt))
    .limit(1);

  const oldest = sessions[0];
  if (!oldest) return null;

  await db.delete(authSessions).where(eq(authSessions.id, oldest.id));
  return oldest;
}

export async function countActiveSessionsForUser(userId: string) {
  const now = new Date();
  const sessions = await db
    .select({ id: authSessions.id })
    .from(authSessions)
    .where(and(eq(authSessions.userId, userId), gt(authSessions.expires, now)));
  return sessions.length;
}

export async function deleteAllSessionsForUser(userId: string) {
  await db.delete(authSessions).where(eq(authSessions.userId, userId));
}

export async function touchSession(sessionToken: string) {
  await db
    .update(authSessions)
    .set({ lastActiveAt: new Date() })
    .where(eq(authSessions.sessionToken, sessionToken));
}
