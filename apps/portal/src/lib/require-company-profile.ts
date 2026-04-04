import "server-only";
import { auth } from "@igbo/auth";
import { getCompanyByOwnerId } from "@igbo/db/queries/portal-companies";
import { redirect } from "next/navigation";

export async function requireCompanyProfile(locale: string) {
  const session = await auth();
  if (!session?.user || session.user.activePortalRole !== "EMPLOYER") return null;
  const profile = await getCompanyByOwnerId(session.user.id);
  if (!profile) {
    redirect(`/${locale}/company-profile?onboarding=true`);
  }
  return profile;
}
