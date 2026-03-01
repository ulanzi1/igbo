"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useMemberSuggestions } from "../hooks/use-member-suggestions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { MemberSuggestion, SuggestionReasonType } from "@/services/suggestion-service";

function formatReason(
  t: ReturnType<typeof useTranslations<"Dashboard">>,
  reasonType: SuggestionReasonType,
  reasonValue: string,
): string {
  switch (reasonType) {
    case "city":
      return t("peopleNear.reasonCity", { location: reasonValue });
    case "state":
      return t("peopleNear.reasonState", { location: reasonValue });
    case "country":
      return t("peopleNear.reasonCountry", { location: reasonValue });
    case "interest":
      return t("peopleNear.reasonInterest", { interest: reasonValue });
    case "community":
      return t("peopleNear.reasonCommunity");
  }
}

function SuggestionCard({
  suggestion,
  onDismiss,
  t,
}: {
  suggestion: MemberSuggestion;
  onDismiss: () => void;
  t: ReturnType<typeof useTranslations<"Dashboard">>;
}) {
  const { member, reasonType, reasonValue } = suggestion;
  const initials = member.displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="relative flex-shrink-0 w-40 rounded-lg border bg-background p-3 md:w-full md:flex md:items-center md:gap-3">
      {/* Dismiss button — 44px tap target */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("peopleNear.dismissAriaLabel", { name: member.displayName })}
        className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        ×
      </button>

      {/* Avatar — tap to view profile */}
      <Link
        href={`/members/${member.userId}`}
        aria-label={t("peopleNear.viewProfile", { name: member.displayName })}
        className="flex flex-col items-center gap-1 text-center md:flex-row md:text-left"
      >
        <Avatar className="h-12 w-12">
          <AvatarImage src={member.photoUrl ?? undefined} alt={member.displayName} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{member.displayName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {formatReason(t, reasonType, reasonValue)}
          </p>
        </div>
      </Link>

      {/* Message button — 44px tap target */}
      <Button size="sm" className="mt-2 w-full min-h-[44px] md:mt-0 md:ml-auto md:w-auto" asChild>
        <Link href={`/chat?userId=${member.userId}`}>{t("peopleNear.messageCta")}</Link>
      </Button>
    </div>
  );
}

export function PeopleNearYouWidget() {
  const t = useTranslations("Dashboard");
  const { suggestions, isLoading, isError, dismiss } = useMemberSuggestions(5);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div
            className="flex gap-3 overflow-x-auto md:flex-col"
            aria-label={t("peopleNear.loadingAriaLabel")}
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-40 flex-shrink-0 md:w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("peopleNear.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("peopleNear.noSuggestions")}</p>
        </CardContent>
      </Card>
    );
  }

  if (suggestions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("peopleNear.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("peopleNear.noSuggestions")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base">{t("peopleNear.title")}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {t("peopleNear.membersNearby", { count: suggestions.length })}
          </p>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/discover">{t("peopleNear.seeAll")}</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {/* Mobile: horizontal scroll; Desktop (sidebar): vertical stack */}
        <div className="flex gap-3 overflow-x-auto pb-2 md:flex-col md:overflow-x-visible md:gap-2 md:pb-0">
          {suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.member.userId}
              suggestion={suggestion}
              onDismiss={() => dismiss(suggestion.member.userId)}
              t={t}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
