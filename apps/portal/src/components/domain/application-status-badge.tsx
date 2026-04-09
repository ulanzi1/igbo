"use client";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import type { PortalApplicationStatus } from "@igbo/db/schema/portal-applications";
import type { VariantProps } from "class-variance-authority";
import { badgeVariants } from "@/components/ui/badge";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

const STATUS_VARIANT: Record<PortalApplicationStatus, BadgeVariant> = {
  submitted: "info",
  under_review: "warning",
  shortlisted: "success",
  interview: "info",
  offered: "success",
  hired: "success",
  rejected: "destructive",
  withdrawn: "secondary",
};

interface ApplicationStatusBadgeProps {
  status: PortalApplicationStatus;
}

export function ApplicationStatusBadge({ status }: ApplicationStatusBadgeProps) {
  const t = useTranslations("Portal.applications");
  const variant = STATUS_VARIANT[status];

  return (
    <Badge variant={variant} role="status" aria-label={t(`status.${status}`)}>
      {t(`status.${status}`)}
    </Badge>
  );
}
