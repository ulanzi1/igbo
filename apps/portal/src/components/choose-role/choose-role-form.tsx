"use client";

import { useState } from "react";
import { BriefcaseIcon, SearchIcon, Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ChooseRoleFormProps {
  locale: string;
}

const REDIRECT_MAP: Record<string, string> = {
  EMPLOYER: "/onboarding",
  JOB_SEEKER: "/onboarding/seeker",
};

export function ChooseRoleForm({ locale }: ChooseRoleFormProps) {
  const { update } = useSession();
  const t = useTranslations("Portal.chooseRole");
  const router = useRouter();
  const [selecting, setSelecting] = useState<"EMPLOYER" | "JOB_SEEKER" | null>(null);

  async function handleSelect(role: "EMPLOYER" | "JOB_SEEKER") {
    if (selecting !== null) return;
    setSelecting(role);

    try {
      const res = await fetch("/api/v1/portal/role/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });

      if (res.status === 409) {
        // Role already assigned (concurrent tab or stale session) —
        // force-refresh the JWT so the client discovers the actual role, then go home.
        try {
          await update();
        } catch {
          // non-fatal
        }
        router.push(`/${locale}`);
        return;
      }

      if (!res.ok) {
        throw new Error("Role selection failed");
      }

      // F8: update() failure is non-fatal — assignment already persisted.
      try {
        await update({ activePortalRole: role });
      } catch {
        // Session cache may be stale; redirect will trigger a fresh session check.
      }
      router.push(`/${locale}${REDIRECT_MAP[role]}`);
    } catch {
      setSelecting(null);
      toast.error(t("error"));
    }
  }

  const isLoading = selecting !== null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl space-y-8">
        {/* Minimal header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
        </div>

        {/* Loading announcement for screen readers */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {isLoading ? t("selecting") : ""}
        </div>

        {/* Role cards */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Employer card */}
          <button
            type="button"
            disabled={isLoading}
            onClick={() => handleSelect("EMPLOYER")}
            className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg disabled:pointer-events-none disabled:opacity-60"
          >
            <Card className="h-full transition-colors hover:border-primary hover:bg-accent/50">
              <CardHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-md bg-primary/10">
                  {selecting === "EMPLOYER" ? (
                    <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
                  ) : (
                    <BriefcaseIcon className="size-5 text-primary" aria-hidden="true" />
                  )}
                </div>
                <CardTitle>{t("employer.title")}</CardTitle>
                <CardDescription>{t("employer.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm font-medium text-primary">{t("employer.cta")}</span>
              </CardContent>
            </Card>
          </button>

          {/* Seeker card */}
          <button
            type="button"
            disabled={isLoading}
            onClick={() => handleSelect("JOB_SEEKER")}
            className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg disabled:pointer-events-none disabled:opacity-60"
          >
            <Card className="h-full transition-colors hover:border-primary hover:bg-accent/50">
              <CardHeader>
                <div className="mb-2 flex size-10 items-center justify-center rounded-md bg-primary/10">
                  {selecting === "JOB_SEEKER" ? (
                    <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
                  ) : (
                    <SearchIcon className="size-5 text-primary" aria-hidden="true" />
                  )}
                </div>
                <CardTitle>{t("seeker.title")}</CardTitle>
                <CardDescription>{t("seeker.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm font-medium text-primary">{t("seeker.cta")}</span>
              </CardContent>
            </Card>
          </button>
        </div>

        {/* Reassurance note */}
        <p className="text-center text-sm text-muted-foreground">{t("addMoreLater")}</p>
      </div>
    </div>
  );
}
