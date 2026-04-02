import { redirect } from "next/navigation";

// Root page redirects to default locale — handled by i18n middleware in production
export default function RootPage() {
  redirect("/en");
}
