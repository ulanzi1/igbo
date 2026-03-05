"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

interface EventMembershipGateProps {
  groupId: string;
  meetingLink?: string | null;
  children?: React.ReactNode;
}

export function EventMembershipGate({ groupId, meetingLink, children }: EventMembershipGateProps) {
  const { data: session, status } = useSession();
  const t = useTranslations("Events");
  const [isMember, setIsMember] = useState<boolean | null>(null);

  useEffect(() => {
    if (status === "loading" || !session?.user?.id) return;
    void checkMembership(groupId, session.user!.id, setIsMember);
  }, [groupId, session, status]);

  if (status === "loading" || isMember === null) {
    return (
      <div className="h-12 w-full animate-pulse rounded-md bg-muted" aria-label="Loading..." />
    );
  }

  if (!session) {
    return (
      <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
        <Link href="/login" className="text-primary underline underline-offset-2">
          {t("gate.signIn")}
        </Link>{" "}
        {t("gate.signInPrompt")}
      </div>
    );
  }

  if (!isMember) {
    return (
      <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
        {t("gate.groupMembersOnly")}{" "}
        <Link href="/events" className="text-primary underline underline-offset-2">
          {t("gate.backToEvents")}
        </Link>
      </div>
    );
  }

  return (
    <>
      {meetingLink && (
        <div className="rounded-md border border-border bg-card p-4 text-sm">
          <span className="font-medium">{t("fields.meetingLink")}: </span>
          <a
            href={meetingLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            {meetingLink}
          </a>
        </div>
      )}
      {children}
    </>
  );
}

async function checkMembership(groupId: string, userId: string, setIsMember: (v: boolean) => void) {
  try {
    const res = await globalThis.fetch(`/api/v1/groups/${groupId}/members?userId=${userId}`, {
      credentials: "include",
    });
    if (res.ok) {
      const data = (await res.json()) as { data?: { members?: { userId: string }[] } };
      const members = data.data?.members ?? [];
      setIsMember(members.some((m) => m.userId === userId));
    } else {
      setIsMember(false);
    }
  } catch {
    setIsMember(false);
  }
}
