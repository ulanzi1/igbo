import { PortalLayout } from "@/components/layout/portal-layout";

/**
 * Layout scoped to /search only.
 *
 * Rationale: the (ungated) group has no group-level layout because the sibling
 * /choose-role page intentionally renders WITHOUT PortalLayout chrome (pre-role
 * onboarding flow). Adding a group-level layout would regress choose-role. Instead
 * we scope PortalLayout to this route via a route-level layout.tsx.
 */
export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return <PortalLayout>{children}</PortalLayout>;
}
