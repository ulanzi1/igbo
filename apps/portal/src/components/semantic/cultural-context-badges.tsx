import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

interface CulturalContextBadgesProps {
  culturalContext: Record<string, boolean> | null;
}

export function CulturalContextBadges({ culturalContext }: CulturalContextBadgesProps) {
  const t = useTranslations("Portal.culturalContext");

  if (!culturalContext) return null;

  const hasAny =
    culturalContext.diasporaFriendly ||
    culturalContext.igboLanguagePreferred ||
    culturalContext.communityReferred;
  if (!hasAny) return null;

  return (
    <div
      className="mt-1 flex flex-wrap gap-1"
      aria-label={t("title")}
      data-testid="cultural-context-badges"
    >
      {culturalContext.diasporaFriendly && (
        <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700">
          {t("badgeDiaspora")}
        </Badge>
      )}
      {culturalContext.igboLanguagePreferred && (
        <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
          {t("badgeIgbo")}
        </Badge>
      )}
      {culturalContext.communityReferred && (
        <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700">
          {t("badgeCommunity")}
        </Badge>
      )}
    </div>
  );
}
