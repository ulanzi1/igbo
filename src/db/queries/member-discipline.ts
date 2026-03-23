import { eq, desc, and, lt, getTableColumns } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { memberDisciplineActions } from "@/db/schema/member-discipline";
import { authUsers } from "@/db/schema/auth-users";

export type {
  MemberDisciplineAction,
  NewMemberDisciplineAction,
} from "@/db/schema/member-discipline";

export interface CreateDisciplineActionParams {
  userId: string;
  moderationActionId?: string | null;
  sourceType: "moderation_action" | "report" | "manual";
  actionType: "warning" | "suspension" | "ban";
  reason: string;
  notes?: string | null;
  suspensionEndsAt?: Date | null;
  issuedBy: string;
}

export async function createDisciplineAction(
  params: CreateDisciplineActionParams,
): Promise<{ id: string }> {
  const rows = await db
    .insert(memberDisciplineActions)
    .values({
      userId: params.userId,
      moderationActionId: params.moderationActionId ?? null,
      sourceType: params.sourceType,
      actionType: params.actionType,
      reason: params.reason,
      notes: params.notes ?? null,
      suspensionEndsAt: params.suspensionEndsAt ?? null,
      issuedBy: params.issuedBy,
      status: "active",
    })
    .returning({ id: memberDisciplineActions.id });

  const id = rows[0]?.id;
  if (!id) throw new Error("Insert returned no id");
  return { id };
}

export async function getDisciplineActionById(id: string) {
  const [row] = await db
    .select()
    .from(memberDisciplineActions)
    .where(eq(memberDisciplineActions.id, id))
    .limit(1);
  return row ?? null;
}

export async function listMemberDisciplineHistory(userId: string) {
  const issuerAlias = alias(authUsers, "issuer");
  const lifterAlias = alias(authUsers, "lifter");

  return db
    .select({
      ...getTableColumns(memberDisciplineActions),
      issuedByName: issuerAlias.name,
      liftedByName: lifterAlias.name,
    })
    .from(memberDisciplineActions)
    .leftJoin(issuerAlias, eq(memberDisciplineActions.issuedBy, issuerAlias.id))
    .leftJoin(lifterAlias, eq(memberDisciplineActions.liftedBy, lifterAlias.id))
    .where(eq(memberDisciplineActions.userId, userId))
    .orderBy(desc(memberDisciplineActions.createdAt));
}

export async function getActiveSuspension(userId: string) {
  const [row] = await db
    .select()
    .from(memberDisciplineActions)
    .where(
      and(
        eq(memberDisciplineActions.userId, userId),
        eq(memberDisciplineActions.actionType, "suspension"),
        eq(memberDisciplineActions.status, "active"),
      ),
    )
    .orderBy(desc(memberDisciplineActions.createdAt))
    .limit(1);
  return row ?? null;
}

export async function expireDisciplineAction(id: string, liftedBy?: string): Promise<void> {
  await db
    .update(memberDisciplineActions)
    .set({
      status: liftedBy ? "lifted" : "expired",
      liftedAt: new Date(),
      ...(liftedBy ? { liftedBy } : {}),
    })
    .where(eq(memberDisciplineActions.id, id));
}

export async function listSuspensionsExpiringBefore(date: Date) {
  return db
    .select()
    .from(memberDisciplineActions)
    .where(
      and(
        eq(memberDisciplineActions.actionType, "suspension"),
        eq(memberDisciplineActions.status, "active"),
        lt(memberDisciplineActions.suspensionEndsAt, date),
      ),
    );
}

export async function getActiveWarnings(
  userId: string,
): Promise<Array<{ id: string; reason: string; createdAt: Date }>> {
  return db
    .select({
      id: memberDisciplineActions.id,
      reason: memberDisciplineActions.reason,
      createdAt: memberDisciplineActions.createdAt,
    })
    .from(memberDisciplineActions)
    .where(
      and(
        eq(memberDisciplineActions.userId, userId),
        eq(memberDisciplineActions.actionType, "warning"),
        eq(memberDisciplineActions.status, "active"),
      ),
    )
    .orderBy(desc(memberDisciplineActions.createdAt));
}
