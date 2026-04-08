import { redirect } from "next/navigation";
import { auth } from "@igbo/auth";
import type { ReactNode } from "react";

interface AdminLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function AdminLayout({ children, params }: AdminLayoutProps) {
  const { locale } = await params;

  const session = await auth();

  if (!session?.user || session.user.activePortalRole !== "JOB_ADMIN") {
    redirect(`/${locale}`);
  }

  return <>{children}</>;
}
