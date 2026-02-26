"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export function GettingStartedWidget() {
  const t = useTranslations("Dashboard");

  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-semibold text-foreground">{t("gettingStarted.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("gettingStarted.subtitle")}</p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Button asChild className="w-full justify-start sm:w-auto">
              <Link href="/groups">{t("gettingStarted.joinGroup")}</Link>
            </Button>
            <p className="text-sm text-muted-foreground">{t("gettingStarted.joinGroupDesc")}</p>
          </div>
          <div className="flex flex-col gap-1">
            <Button asChild className="w-full justify-start sm:w-auto">
              <Link href="/settings/profile">{t("gettingStarted.completeProfile")}</Link>
            </Button>
            <p className="text-sm text-muted-foreground">
              {t("gettingStarted.completeProfileDesc")}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <Button asChild className="w-full justify-start sm:w-auto">
              <Link href="/discover">{t("gettingStarted.exploreMembers")}</Link>
            </Button>
            <p className="text-sm text-muted-foreground">
              {t("gettingStarted.exploreMembersDesc")}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
