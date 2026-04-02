import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@igbo/auth";
import { canCreateEvent } from "@igbo/auth/permissions";
import { getGroupsForUserMembership } from "@igbo/db/queries/groups";
import { EventForm } from "@/features/events/components/EventForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Events" });
  return { title: t("create.title") };
}

export default async function NewEventPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");

  const permission = await canCreateEvent(session.user.id);
  if (!permission.allowed) {
    const t = await getTranslations("Events");
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex flex-col items-center justify-center gap-6 py-16 text-center">
          <div className="max-w-md space-y-3">
            <h2 className="text-xl font-semibold">{t("permissions.createRequired")}</h2>
          </div>
        </div>
      </main>
    );
  }

  // Server-side group fetch — avoid client-side fetch from EventForm
  const userGroups = await getGroupsForUserMembership(session.user.id);

  const t = await getTranslations("Events");

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">{t("create.title")}</h1>
      <EventForm mode="create" userGroups={userGroups} />
    </main>
  );
}
