"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PortalSeekerPreferences } from "@igbo/db/schema/portal-seeker-preferences";

const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
const WORK_MODE_LABEL_KEYS = {
  remote: "preferencesWorkModeRemote",
  hybrid: "preferencesWorkModeHybrid",
  onsite: "preferencesWorkModeOnsite",
} as const satisfies Record<(typeof WORK_MODES)[number], string>;
const CURRENCIES = ["NGN", "USD", "EUR", "GBP"] as const;
const MAX_ROLES = 20;
const MAX_LOCATIONS = 20;

interface SeekerPreferencesSectionProps {
  initialPrefs?: PortalSeekerPreferences | null;
}

export function SeekerPreferencesSection({ initialPrefs }: SeekerPreferencesSectionProps) {
  const t = useTranslations("Portal.seeker");

  const [desiredRoles, setDesiredRoles] = React.useState<string[]>(
    initialPrefs?.desiredRoles ?? [],
  );
  const [roleInput, setRoleInput] = React.useState("");
  const [salaryMin, setSalaryMin] = React.useState(
    initialPrefs?.salaryMin != null ? String(initialPrefs.salaryMin) : "",
  );
  const [salaryMax, setSalaryMax] = React.useState(
    initialPrefs?.salaryMax != null ? String(initialPrefs.salaryMax) : "",
  );
  const [salaryCurrency, setSalaryCurrency] = React.useState<string>(
    initialPrefs?.salaryCurrency ?? "NGN",
  );
  const [locations, setLocations] = React.useState<string[]>(initialPrefs?.locations ?? []);
  const [locationInput, setLocationInput] = React.useState("");
  const [workModes, setWorkModes] = React.useState<string[]>(initialPrefs?.workModes ?? []);
  const [submitting, setSubmitting] = React.useState(false);

  function addRole() {
    const trimmed = roleInput.trim();
    if (!trimmed || desiredRoles.includes(trimmed) || desiredRoles.length >= MAX_ROLES) return;
    setDesiredRoles((prev) => [...prev, trimmed]);
    setRoleInput("");
  }

  function removeRole(role: string) {
    setDesiredRoles((prev) => prev.filter((r) => r !== role));
  }

  function addLocation() {
    const trimmed = locationInput.trim();
    if (!trimmed || locations.includes(trimmed) || locations.length >= MAX_LOCATIONS) return;
    setLocations((prev) => [...prev, trimmed]);
    setLocationInput("");
  }

  function removeLocation(loc: string) {
    setLocations((prev) => prev.filter((l) => l !== loc));
  }

  function toggleWorkMode(mode: string) {
    setWorkModes((prev) =>
      prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/seekers/me/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          desiredRoles,
          salaryMin: salaryMin ? Number(salaryMin) : null,
          salaryMax: salaryMax ? Number(salaryMax) : null,
          salaryCurrency,
          locations,
          workModes,
        }),
      });
      if (!res.ok) {
        toast.error(t("preferencesError"));
        return;
      }
      toast.success(t("preferencesSuccess"));
    } catch {
      toast.error(t("preferencesError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-label={t("preferencesTitle")}>
      <h2 className="text-lg font-semibold mb-4">{t("preferencesTitle")}</h2>

      {/* Desired roles */}
      <div className="mb-4">
        <Label htmlFor="role-input">{t("preferencesDesiredRoles")}</Label>
        <div className="flex gap-2 mt-1">
          <Input
            id="role-input"
            value={roleInput}
            onChange={(e) => setRoleInput(e.target.value)}
            placeholder={t("preferencesDesiredRolesPlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addRole();
              }
            }}
            disabled={desiredRoles.length >= MAX_ROLES}
          />
          <Button type="button" variant="outline" onClick={addRole}>
            +
          </Button>
        </div>
        {desiredRoles.length >= MAX_ROLES && (
          <p className="text-sm text-muted-foreground mt-1">
            {t("preferencesDesiredRolesCapReached")}
          </p>
        )}
        <div className="flex flex-wrap gap-2 mt-2">
          {desiredRoles.map((role) => (
            <Badge key={role} variant="secondary" className="gap-1">
              {role}
              <button
                type="button"
                aria-label={`Remove ${role}`}
                onClick={() => removeRole(role)}
                className="ml-1"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      </div>

      {/* Salary range */}
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div>
          <Label htmlFor="salary-min">{t("preferencesSalaryMin")}</Label>
          <Input
            id="salary-min"
            type="number"
            min={0}
            value={salaryMin}
            onChange={(e) => setSalaryMin(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <Label htmlFor="salary-max">{t("preferencesSalaryMax")}</Label>
          <Input
            id="salary-max"
            type="number"
            min={0}
            value={salaryMax}
            onChange={(e) => setSalaryMax(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <Label>{t("preferencesCurrency")}</Label>
          <Select value={salaryCurrency} onValueChange={setSalaryCurrency}>
            <SelectTrigger aria-label={t("preferencesCurrency")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-4">{t("preferencesSalaryHelp")}</p>

      {/* Locations */}
      <div className="mb-4">
        <Label htmlFor="location-input">{t("preferencesLocations")}</Label>
        <div className="flex gap-2 mt-1">
          <Input
            id="location-input"
            value={locationInput}
            onChange={(e) => setLocationInput(e.target.value)}
            placeholder={t("preferencesLocationsPlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addLocation();
              }
            }}
            disabled={locations.length >= MAX_LOCATIONS}
          />
          <Button type="button" variant="outline" onClick={addLocation}>
            +
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-2">
          {locations.map((loc) => (
            <Badge key={loc} variant="secondary" className="gap-1">
              {loc}
              <button
                type="button"
                aria-label={`Remove ${loc}`}
                onClick={() => removeLocation(loc)}
                className="ml-1"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      </div>

      {/* Work modes */}
      <fieldset className="mb-6">
        <legend className="text-sm font-medium mb-2">{t("preferencesWorkModes")}</legend>
        <div className="flex flex-wrap gap-3">
          {WORK_MODES.map((mode) => (
            <label key={mode} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={workModes.includes(mode)}
                onChange={() => toggleWorkMode(mode)}
                className="h-4 w-4"
              />
              {t(WORK_MODE_LABEL_KEYS[mode] as Parameters<typeof t>[0])}
            </label>
          ))}
        </div>
      </fieldset>

      <Button type="submit" disabled={submitting}>
        {submitting ? "…" : t("preferencesSave")}
      </Button>
    </form>
  );
}
