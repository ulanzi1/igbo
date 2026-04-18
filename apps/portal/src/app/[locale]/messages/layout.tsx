import { PortalLayout } from "@/components/layout/portal-layout";

/**
 * Layout for /messages — provides PortalLayout navigation chrome.
 *
 * This route sits outside the (gated) and (ungated) route groups, so it does
 * not inherit a group-level layout. A route-level layout is required to wrap
 * with PortalLayout for top/bottom navigation. Auth gating is handled at the
 * page level. If this route is ever moved into (gated), remove this layout to
 * avoid double-wrapping PortalLayout.
 */
export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return <PortalLayout>{children}</PortalLayout>;
}
