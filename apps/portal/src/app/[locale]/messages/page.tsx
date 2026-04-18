import { getTranslations } from "next-intl/server";
import { auth } from "@igbo/auth";
import { redirect } from "next/navigation";
import { MessageSquareIcon } from "lucide-react";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function MessagesPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations("Portal.nav");
  const tLifecycle = await getTranslations("Portal.lifecycle");

  const session = await auth();
  if (!session?.user) {
    redirect(`/${locale}`);
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <MessageSquareIcon className="size-12 text-muted-foreground mb-4" aria-hidden="true" />
      <h1 className="text-2xl font-bold mb-2">{t("messages")}</h1>
      <p className="text-muted-foreground">{tLifecycle("comingSoon")}</p>
    </div>
  );
}
