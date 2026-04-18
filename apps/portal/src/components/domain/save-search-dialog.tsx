"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { JobSearchUrlState } from "@/lib/search-url-params";
import { countActiveFilters } from "@/lib/search-url-params";

type AlertFrequency = "instant" | "daily" | "off";

interface SaveSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchParams: JobSearchUrlState;
  onSaved: () => void;
  savedSearchCount: number;
}

function buildParamsPreview(
  searchParams: JobSearchUrlState,
  t: ReturnType<typeof useTranslations<"Portal.savedSearch">>,
): string {
  const hasQuery = searchParams.q.trim().length > 0;
  const filterCount = countActiveFilters(searchParams);

  if (hasQuery && filterCount > 0) {
    return t("params", { query: searchParams.q.trim(), filterCount });
  }
  if (hasQuery) {
    return t("paramsQueryOnly", { query: searchParams.q.trim() });
  }
  if (filterCount > 0) {
    return t("paramsNoQuery", { filterCount });
  }
  return t("paramsAll");
}

export function SaveSearchDialog({
  open,
  onOpenChange,
  searchParams,
  onSaved,
  savedSearchCount,
}: SaveSearchDialogProps) {
  const t = useTranslations("Portal.savedSearch");
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<AlertFrequency>("daily");
  const [loading, setLoading] = useState(false);

  const isDisabled = savedSearchCount >= 10;
  const paramsPreview = buildParamsPreview(searchParams, t);

  async function handleSave() {
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        searchParams: {
          query: searchParams.q || undefined,
          filters: {
            location: searchParams.location.length > 0 ? searchParams.location : undefined,
            employmentType:
              searchParams.employmentType.length > 0 ? searchParams.employmentType : undefined,
            industry: searchParams.industry.length > 0 ? searchParams.industry : undefined,
            salaryMin: searchParams.salaryMin ?? undefined,
            salaryMax: searchParams.salaryMax ?? undefined,
            remote: searchParams.remote || undefined,
            culturalContext: {
              diasporaFriendly: searchParams.culturalContextDiasporaFriendly || undefined,
              igboPreferred: searchParams.culturalContextIgboPreferred || undefined,
              communityReferred: searchParams.culturalContextCommunityReferred || undefined,
            },
          },
        },
        alertFrequency: frequency,
      };
      if (name.trim()) {
        payload["name"] = name.trim();
      }

      const res = await fetch("/api/v1/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        toast.error(t("errorSaving"));
        return;
      }

      toast.success(t("saved"));
      setName("");
      setFrequency("daily");
      onOpenChange(false);
      onSaved();
    } catch {
      toast.error(t("errorSaving"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>{t("dialogDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Search params preview */}
          <p className="text-sm text-muted-foreground" data-testid="params-preview">
            {paramsPreview}
          </p>

          {/* Name input */}
          <div className="space-y-1.5">
            <Label htmlFor="save-search-name">{t("nameLabel")}</Label>
            <Input
              id="save-search-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              data-testid="save-search-name-input"
              disabled={isDisabled}
            />
          </div>

          {/* Alert frequency */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("frequencyLabel")}</legend>
            <RadioGroup
              value={frequency}
              onValueChange={(v) => setFrequency(v as AlertFrequency)}
              data-testid="frequency-radio-group"
            >
              {(["instant", "daily", "off"] as const).map((freq) => (
                <div key={freq} className="flex items-start gap-2">
                  <RadioGroupItem value={freq} id={`freq-${freq}`} data-testid={`freq-${freq}`} />
                  <div>
                    <Label htmlFor={`freq-${freq}`} className="font-medium cursor-pointer">
                      {t(
                        freq === "instant"
                          ? "frequencyInstant"
                          : freq === "daily"
                            ? "frequencyDaily"
                            : "frequencyOff",
                      )}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        freq === "instant"
                          ? "frequencyInstantDescription"
                          : freq === "daily"
                            ? "frequencyDailyDescription"
                            : "frequencyOffDescription",
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            data-testid="cancel-button"
          >
            {t("cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isDisabled || loading}
            data-testid="save-button"
          >
            {loading ? "…" : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
