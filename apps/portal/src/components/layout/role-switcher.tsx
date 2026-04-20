"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActivePortalRole } from "@/hooks/use-active-portal-role";
import type { PortalRole } from "@/hooks/use-active-portal-role";

/** Maps a portal role to its post-switch redirect path (without locale prefix) */
const ROLE_REDIRECT: Record<Exclude<PortalRole, null>, string> = {
  JOB_SEEKER: "/jobs",
  EMPLOYER: "/my-jobs",
  JOB_ADMIN: "/admin",
};

export function RoleSwitcher() {
  const { update } = useSession();
  const t = useTranslations("Portal.role");
  const locale = useLocale();
  const router = useRouter();
  const { role, isAuthenticated, allRoles, hasMultipleRoles } = useActivePortalRole();
  const [isSwitching, setIsSwitching] = useState(false);

  // Unauthenticated — render nothing
  if (!isAuthenticated) return null;

  // No portal roles assigned yet — render nothing (user will be redirected to choose-role)
  if (allRoles.length === 0) return null;

  function getRoleLabel(r: Exclude<PortalRole, null>): string {
    if (r === "EMPLOYER") return t("employer");
    if (r === "JOB_ADMIN") return t("jobAdmin");
    return t("seeker");
  }

  const activeLabel = role ? getRoleLabel(role) : t("seeker");

  // Single-role — static badge, no interaction
  if (!hasMultipleRoles) {
    return (
      <Badge variant="outline" className="text-xs">
        {activeLabel}
      </Badge>
    );
  }

  async function handleRoleChange(selectedRole: string) {
    if (selectedRole === role || isSwitching) return;
    const validRole = selectedRole as Exclude<PortalRole, null>;
    setIsSwitching(true);
    try {
      await update({ activePortalRole: validRole });
      toast(t("switchedTo", { role: getRoleLabel(validRole) }));
      router.push(`/${locale}${ROLE_REDIRECT[validRole]}`);
    } catch {
      toast.error(t("switchingRole"));
    } finally {
      setIsSwitching(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("switchRoleLabel")}
          disabled={isSwitching}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          <span className="text-[oklch(0.45_0.09_160)]">{activeLabel}</span>
          <ChevronDownIcon className="size-3 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        <DropdownMenuRadioGroup value={role ?? ""} onValueChange={handleRoleChange}>
          {allRoles.map((r) => (
            <DropdownMenuRadioItem key={r} value={r} aria-current={r === role ? "true" : undefined}>
              {getRoleLabel(r)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
