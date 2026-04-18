import { PortalLayout } from "@/components/layout/portal-layout";

/**
 * Layout for /apprenticeships — provides PortalLayout navigation chrome.
 *
 * This route sits outside the (gated) and (ungated) route groups, so it does
 * not inherit a group-level layout. A route-level layout is required to wrap
 * with PortalLayout for top/bottom navigation.
 */
export default function ApprenticeshipsLayout({ children }: { children: React.ReactNode }) {
  return <PortalLayout>{children}</PortalLayout>;
}
