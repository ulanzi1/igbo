import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { auth } from "@igbo/auth";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { getSeekerProfileByUserId } from "@igbo/db/queries/portal-seeker-profiles";
import type { Session } from "next-auth";

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function PortalHomePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Portal.home");
  const tNav = await getTranslations("Portal.nav");
  const tGuest = await getTranslations("Portal.guest");

  const session = (await auth()) as Session | null;
  const activePortalRole = (session?.user as { activePortalRole?: string } | undefined)
    ?.activePortalRole;

  const communityUrl = process.env.COMMUNITY_URL ?? "http://localhost:3000"; // ci-allow-process-env — portal env.ts not yet created (VD-6)
  const portalUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3001"; // ci-allow-process-env — portal env.ts not yet created (VD-6)

  // Employer onboarding redirect logic
  if (session?.user && activePortalRole === "EMPLOYER") {
    const profile = await getCompanyByOwnerId(session.user.id);
    if (!profile || !profile.onboardingCompletedAt) {
      redirect(`/${locale}/onboarding`);
    }
  }

  // Seeker onboarding redirect logic
  if (session?.user && activePortalRole === "JOB_SEEKER") {
    const seekerProfile = await getSeekerProfileByUserId(session.user.id);
    if (!seekerProfile || !seekerProfile.onboardingCompletedAt) {
      redirect(`/${locale}/onboarding/seeker`);
    }
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <h1 className="text-3xl font-bold text-foreground mb-2">{t("title")}</h1>
        <p className="text-muted-foreground mb-8">{t("guestWelcome")}</p>
        <div className="flex gap-4">
          <a
            href={`${communityUrl}/login?returnTo=${encodeURIComponent(`${portalUrl}/${locale}`)}`}
            className="inline-flex items-center justify-center min-h-[44px] px-6 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            {tNav("login")}
          </a>
          <a
            href={`${communityUrl}/join`}
            className="inline-flex items-center justify-center min-h-[44px] px-6 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            {tNav("joinNow")}
          </a>
        </div>
        <p className="text-muted-foreground text-sm mt-4">{tGuest("loginPrompt")}</p>
      </div>
    );
  }

  const isEmployer = activePortalRole === "EMPLOYER";
  const welcomeMessage = isEmployer ? t("employerWelcome") : t("seekerWelcome");

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <h1 className="text-3xl font-bold text-foreground mb-2">{t("title")}</h1>
      <p className="text-lg text-muted-foreground mb-4">{welcomeMessage}</p>
      <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
    </div>
  );
}
