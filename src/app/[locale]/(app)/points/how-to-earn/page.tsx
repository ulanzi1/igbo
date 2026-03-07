import { getTranslations } from "next-intl/server";
import { getActivePointsRules, getAllPostingLimits } from "@/db/queries/points";
import { BADGE_MULTIPLIERS } from "@/config/points";

export const revalidate = 60;

export default async function HowToEarnPage({ params }: { params: Promise<{ locale: string }> }) {
  await params; // consume params (locale used by next-intl middleware)
  const t = await getTranslations("Points");

  const [rules, postingLimits] = await Promise.all([getActivePointsRules(), getAllPostingLimits()]);

  const professional = postingLimits.filter((r) => r.tier === "PROFESSIONAL");
  const topTier = postingLimits.filter((r) => r.tier === "TOP_TIER");

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-2">{t("howToEarn.title")}</h1>
      <p className="text-muted-foreground mb-8">{t("howToEarn.intro")}</p>

      {/* Section 1: Earning Rules */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-4">{t("howToEarn.earningRules.sectionTitle")}</h2>
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("howToEarn.earningRules.noRules")}</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4">
                  {t("howToEarn.earningRules.activityColumn")}
                </th>
                <th className="text-left py-2 pr-4">{t("howToEarn.earningRules.pointsColumn")}</th>
                <th className="text-left py-2">{t("howToEarn.earningRules.descriptionColumn")}</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => {
                const key = `history.sourceTypes.${rule.activityType}` as Parameters<typeof t>[0];
                const activityLabel = t.has(key) ? t(key) : rule.activityType;
                return (
                  <tr key={rule.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{activityLabel}</td>
                    <td className="py-2 pr-4">{rule.basePoints}</td>
                    <td className="py-2 text-muted-foreground">{rule.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Section 2: Badge Multipliers */}
      <section className="mb-10">
        <h2 className="text-xl font-semibold mb-2">{t("howToEarn.badges.sectionTitle")}</h2>
        <p className="text-sm text-muted-foreground mb-4">{t("howToEarn.badges.intro")}</p>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-4">{t("howToEarn.badges.badgeColumn")}</th>
              <th className="text-left py-2">{t("howToEarn.badges.multiplierColumn")}</th>
            </tr>
          </thead>
          <tbody>
            {(Object.entries(BADGE_MULTIPLIERS) as [string, number][]).map(
              ([color, multiplier]) => {
                const labelKey = `howToEarn.badges.${color}` as Parameters<typeof t>[0];
                const label = t(labelKey);
                return (
                  <tr key={color} className="border-b last:border-0">
                    <td className="py-2 pr-4 flex items-center gap-2">
                      <span
                        className={`inline-block w-3 h-3 rounded-full ${
                          color === "blue"
                            ? "bg-blue-500"
                            : color === "red"
                              ? "bg-red-500"
                              : "bg-purple-500"
                        }`}
                      />
                      {label}
                    </td>
                    <td className="py-2">
                      {t("howToEarn.badges.multiplierValue", { value: multiplier })}
                    </td>
                  </tr>
                );
              },
            )}
          </tbody>
        </table>
      </section>

      {/* Section 3: Posting Limits */}
      <section>
        <h2 className="text-xl font-semibold mb-2">{t("howToEarn.postingLimits.sectionTitle")}</h2>
        <p className="text-sm text-muted-foreground mb-2">{t("howToEarn.postingLimits.intro")}</p>
        <p className="text-sm font-medium text-muted-foreground mb-6">
          {t("howToEarn.postingLimits.basicNote")}
        </p>

        {/* Professional */}
        <h3 className="text-base font-semibold mb-2">
          {t("howToEarn.postingLimits.professionalTitle")}
        </h3>
        <table className="w-full text-sm border-collapse mb-8">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-4">
                {t("howToEarn.postingLimits.thresholdColumn")}
              </th>
              <th className="text-left py-2">{t("howToEarn.postingLimits.limitColumn")}</th>
            </tr>
          </thead>
          <tbody>
            {professional.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="py-2 pr-4">
                  {row.pointsThreshold === 0
                    ? t("howToEarn.postingLimits.atStart")
                    : String(row.pointsThreshold)}
                </td>
                <td className="py-2">{row.baseLimit + row.bonusLimit}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Top Tier */}
        <h3 className="text-base font-semibold mb-2">
          {t("howToEarn.postingLimits.topTierTitle")}
        </h3>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-4">
                {t("howToEarn.postingLimits.thresholdColumn")}
              </th>
              <th className="text-left py-2">{t("howToEarn.postingLimits.limitColumn")}</th>
            </tr>
          </thead>
          <tbody>
            {topTier.map((row) => (
              <tr key={row.id} className="border-b last:border-0">
                <td className="py-2 pr-4">
                  {row.pointsThreshold === 0
                    ? t("howToEarn.postingLimits.atStart")
                    : String(row.pointsThreshold)}
                </td>
                <td className="py-2">{row.baseLimit + row.bonusLimit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
