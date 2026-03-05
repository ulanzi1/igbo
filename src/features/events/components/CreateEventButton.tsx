"use client";

import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * Client component that conditionally renders "Create Event" button.
 * Only shown to authenticated users (permission check happens server-side on /events/new).
 * Unauthenticated visitors do not see the button per AC #6.
 */
export function CreateEventButton() {
  const { data: session } = useSession();
  const t = useTranslations("Events");

  if (!session?.user?.id) {
    return null;
  }

  return (
    <Link
      href="/events/new"
      className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
    >
      {t("list.createButton")}
    </Link>
  );
}
