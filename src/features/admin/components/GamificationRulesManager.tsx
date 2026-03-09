"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface PointsRule {
  id: string;
  activityType: string;
  basePoints: number;
  isActive: boolean;
  description: string | null;
}

interface PostingLimit {
  id: string;
  tier: string;
  baseLimit: number;
  bonusLimit: number;
  pointsThreshold: number;
}

export function GamificationRulesManager() {
  const t = useTranslations("Admin.gamification");
  const qc = useQueryClient();

  // ─── Points Rules state ───────────────────────────────────────────────────
  const [rulesEdits, setRulesEdits] = useState<
    Record<string, { basePoints: number; isActive: boolean }>
  >({});
  const [rulesSaved, setRulesSaved] = useState<Record<string, boolean>>({});
  const [rulesErrors, setRulesErrors] = useState<Record<string, boolean>>({});

  const rulesQuery = useQuery<{ rules: PointsRule[] }>({
    queryKey: ["admin", "points-rules"],
    queryFn: async () => {
      const res = await fetch("/api/v1/admin/points-rules", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      return json.data as { rules: PointsRule[] };
    },
  });

  const rulesMutation = useMutation({
    mutationFn: async (payload: { id: string; basePoints?: number; isActive?: boolean }) => {
      const res = await fetch("/api/v1/admin/points-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["admin", "points-rules"] });
      setRulesSaved((prev) => ({ ...prev, [variables.id]: true }));
      setRulesErrors((prev) => ({ ...prev, [variables.id]: false }));
      setTimeout(() => setRulesSaved((prev) => ({ ...prev, [variables.id]: false })), 2000);
    },
    onError: (_err, variables) => {
      setRulesErrors((prev) => ({ ...prev, [variables.id]: true }));
    },
  });

  // ─── Posting Limits state ─────────────────────────────────────────────────
  const [limitsEdits, setLimitsEdits] = useState<
    Record<string, { baseLimit: number; bonusLimit: number; pointsThreshold: number }>
  >({});
  const [limitsSaved, setLimitsSaved] = useState<Record<string, boolean>>({});
  const [limitsErrors, setLimitsErrors] = useState<Record<string, boolean>>({});

  const limitsQuery = useQuery<{ limits: PostingLimit[] }>({
    queryKey: ["admin", "posting-limits"],
    queryFn: async () => {
      const res = await fetch("/api/v1/admin/posting-limits", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      return json.data as { limits: PostingLimit[] };
    },
  });

  const limitsMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      baseLimit?: number;
      bonusLimit?: number;
      pointsThreshold?: number;
    }) => {
      const res = await fetch("/api/v1/admin/posting-limits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["admin", "posting-limits"] });
      setLimitsSaved((prev) => ({ ...prev, [variables.id]: true }));
      setLimitsErrors((prev) => ({ ...prev, [variables.id]: false }));
      setTimeout(() => setLimitsSaved((prev) => ({ ...prev, [variables.id]: false })), 2000);
    },
    onError: (_err, variables) => {
      setLimitsErrors((prev) => ({ ...prev, [variables.id]: true }));
    },
  });

  // ─── Daily Cap state ──────────────────────────────────────────────────────
  const [dailyCapEdit, setDailyCapEdit] = useState<number | null>(null);
  const [dailyCapSaved, setDailyCapSaved] = useState(false);
  const [dailyCapError, setDailyCapError] = useState(false);

  const dailyCapQuery = useQuery<{ value: number }>({
    queryKey: ["admin", "daily-cap"],
    queryFn: async () => {
      const res = await fetch("/api/v1/admin/daily-cap", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      const json = await res.json();
      return json.data as { value: number };
    },
  });

  const dailyCapMutation = useMutation({
    mutationFn: async (value: number) => {
      const res = await fetch("/api/v1/admin/daily-cap", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error("Save failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "daily-cap"] });
      setDailyCapSaved(true);
      setDailyCapError(false);
      setTimeout(() => setDailyCapSaved(false), 2000);
    },
    onError: () => {
      setDailyCapError(true);
    },
  });

  return (
    <div className="space-y-10">
      {/* ─── Points Rules ─────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold mb-4">{t("pointsRules")}</h2>
        {rulesQuery.isLoading && <p className="text-muted-foreground">{t("loading")}</p>}
        {rulesQuery.isError && <p className="text-destructive">{t("loadError")}</p>}
        {rulesQuery.data && (
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-2">{t("activityType")}</th>
                  <th className="text-left px-4 py-2">{t("description")}</th>
                  <th className="text-left px-4 py-2">{t("basePoints")}</th>
                  <th className="text-left px-4 py-2">{t("active")}</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rulesQuery.data.rules.map((rule) => {
                  const edit = rulesEdits[rule.id];
                  const basePoints = edit?.basePoints ?? rule.basePoints;
                  const isActive = edit?.isActive ?? rule.isActive;
                  return (
                    <tr key={rule.id} className="border-t">
                      <td className="px-4 py-2 font-mono text-xs">{rule.activityType}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {rule.description ?? "—"}
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          className="w-20 border rounded px-2 py-1 text-sm"
                          value={basePoints}
                          min={0}
                          onChange={(e) =>
                            setRulesEdits((prev) => ({
                              ...prev,
                              [rule.id]: {
                                basePoints: parseInt(e.target.value, 10) || 0,
                                isActive: prev[rule.id]?.isActive ?? rule.isActive,
                              },
                            }))
                          }
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={isActive}
                          onChange={(e) =>
                            setRulesEdits((prev) => ({
                              ...prev,
                              [rule.id]: {
                                basePoints: prev[rule.id]?.basePoints ?? rule.basePoints,
                                isActive: e.target.checked,
                              },
                            }))
                          }
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        {rulesSaved[rule.id] && (
                          <span className="text-green-600 text-xs mr-2">{t("saved")}</span>
                        )}
                        {rulesErrors[rule.id] && (
                          <span className="text-destructive text-xs mr-2">{t("error")}</span>
                        )}
                        <button
                          className="px-3 py-1 rounded bg-primary text-primary-foreground text-xs"
                          disabled={rulesMutation.isPending}
                          onClick={() =>
                            rulesMutation.mutate({
                              id: rule.id,
                              basePoints,
                              isActive,
                            })
                          }
                        >
                          {t("save")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ─── Posting Limits ───────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold mb-4">{t("postingLimits")}</h2>
        {limitsQuery.isLoading && <p className="text-muted-foreground">{t("loading")}</p>}
        {limitsQuery.isError && <p className="text-destructive">{t("loadError")}</p>}
        {limitsQuery.data && (
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left px-4 py-2">{t("tier")}</th>
                  <th className="text-left px-4 py-2">{t("baseLimit")}</th>
                  <th className="text-left px-4 py-2">{t("bonusLimit")}</th>
                  <th className="text-left px-4 py-2">{t("pointsThreshold")}</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {limitsQuery.data.limits.map((limit) => {
                  const edit = limitsEdits[limit.id];
                  const baseLimit = edit?.baseLimit ?? limit.baseLimit;
                  const bonusLimit = edit?.bonusLimit ?? limit.bonusLimit;
                  const pointsThreshold = edit?.pointsThreshold ?? limit.pointsThreshold;
                  return (
                    <tr key={limit.id} className="border-t">
                      <td className="px-4 py-2 font-mono text-xs">{limit.tier}</td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          className="w-16 border rounded px-2 py-1 text-sm"
                          value={baseLimit}
                          min={0}
                          onChange={(e) =>
                            setLimitsEdits((prev) => ({
                              ...prev,
                              [limit.id]: {
                                ...{ baseLimit, bonusLimit, pointsThreshold },
                                ...prev[limit.id],
                                baseLimit: parseInt(e.target.value, 10) || 0,
                              },
                            }))
                          }
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          className="w-16 border rounded px-2 py-1 text-sm"
                          value={bonusLimit}
                          min={0}
                          onChange={(e) =>
                            setLimitsEdits((prev) => ({
                              ...prev,
                              [limit.id]: {
                                ...{ baseLimit, bonusLimit, pointsThreshold },
                                ...prev[limit.id],
                                bonusLimit: parseInt(e.target.value, 10) || 0,
                              },
                            }))
                          }
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          className="w-24 border rounded px-2 py-1 text-sm"
                          value={pointsThreshold}
                          min={0}
                          onChange={(e) =>
                            setLimitsEdits((prev) => ({
                              ...prev,
                              [limit.id]: {
                                ...{ baseLimit, bonusLimit, pointsThreshold },
                                ...prev[limit.id],
                                pointsThreshold: parseInt(e.target.value, 10) || 0,
                              },
                            }))
                          }
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        {limitsSaved[limit.id] && (
                          <span className="text-green-600 text-xs mr-2">{t("saved")}</span>
                        )}
                        {limitsErrors[limit.id] && (
                          <span className="text-destructive text-xs mr-2">{t("error")}</span>
                        )}
                        <button
                          className="px-3 py-1 rounded bg-primary text-primary-foreground text-xs"
                          disabled={limitsMutation.isPending}
                          onClick={() =>
                            limitsMutation.mutate({
                              id: limit.id,
                              baseLimit,
                              bonusLimit,
                              pointsThreshold,
                            })
                          }
                        >
                          {t("save")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ─── Daily Cap ────────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-lg font-semibold mb-4">{t("dailyCap")}</h2>
        {dailyCapQuery.isLoading && <p className="text-muted-foreground">{t("loading")}</p>}
        {dailyCapQuery.isError && <p className="text-destructive">{t("loadError")}</p>}
        {dailyCapQuery.data && (
          <div className="border rounded-xl p-4 bg-card flex items-center gap-4">
            <input
              type="number"
              className="w-28 border rounded px-3 py-2 text-sm"
              value={dailyCapEdit ?? dailyCapQuery.data.value}
              min={1}
              onChange={(e) => setDailyCapEdit(parseInt(e.target.value, 10) || 1)}
            />
            {dailyCapSaved && <span className="text-green-600 text-xs">{t("saved")}</span>}
            {dailyCapError && <span className="text-destructive text-xs">{t("error")}</span>}
            <button
              className="px-4 py-2 rounded bg-primary text-primary-foreground text-sm"
              disabled={dailyCapMutation.isPending}
              onClick={() => dailyCapMutation.mutate(dailyCapEdit ?? dailyCapQuery.data!.value)}
            >
              {t("save")}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
