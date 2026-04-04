"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import {
  jobPostingSchema,
  EMPLOYMENT_TYPE_OPTIONS,
  CulturalContext,
} from "@/lib/validations/job-posting";
import { SalaryRangeInput } from "@/components/domain/salary-range-input";
import { CulturalContextToggles } from "@/components/domain/cultural-context-toggles";
import { PortalRichTextEditorSkeleton } from "./portal-rich-text-editor";

const PortalRichTextEditor = dynamic(
  () => import("./portal-rich-text-editor").then((m) => ({ default: m.PortalRichTextEditor })),
  { ssr: false, loading: () => <PortalRichTextEditorSkeleton /> },
);

interface JobPostingFormProps {
  companyId: string;
  onSuccess?: (postingId: string) => void;
}

interface FormErrors {
  title?: string;
  employmentType?: string;
  salaryMin?: string;
  salaryMax?: string;
  [key: string]: string | undefined;
}

const DEFAULT_CULTURAL_CONTEXT: CulturalContext = {
  diasporaFriendly: false,
  igboLanguagePreferred: false,
  communityReferred: false,
};

export function JobPostingForm({ companyId: _companyId, onSuccess }: JobPostingFormProps) {
  const t = useTranslations("Portal.posting");
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [employmentType, setEmploymentType] = useState("");
  const [location, setLocation] = useState("");
  const [salaryMin, setSalaryMin] = useState<number | null>(null);
  const [salaryMax, setSalaryMax] = useState<number | null>(null);
  const [salaryCompetitiveOnly, setSalaryCompetitiveOnly] = useState(false);
  const [applicationDeadline, setApplicationDeadline] = useState("");
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [requirementsHtml, setRequirementsHtml] = useState("");

  // Cultural context + Igbo description state
  const [culturalContextJson, setCulturalContextJson] =
    useState<CulturalContext>(DEFAULT_CULTURAL_CONTEXT);
  const [showIgboEditor, setShowIgboEditor] = useState(false);
  const [descriptionIgboHtml, setDescriptionIgboHtml] = useState("");

  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const savedRef = useRef(false);

  // Dirty tracking
  useEffect(() => {
    if (savedRef.current) return;
    if (
      title ||
      employmentType ||
      location ||
      descriptionHtml ||
      requirementsHtml ||
      showIgboEditor ||
      descriptionIgboHtml ||
      culturalContextJson.diasporaFriendly ||
      culturalContextJson.igboLanguagePreferred ||
      culturalContextJson.communityReferred
    ) {
      setIsDirty(true);
    }
  }, [
    title,
    employmentType,
    location,
    descriptionHtml,
    requirementsHtml,
    showIgboEditor,
    descriptionIgboHtml,
    culturalContextJson,
  ]);

  // Beforeunload warning on dirty form
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    if (isDirty) {
      window.addEventListener("beforeunload", handleBeforeUnload);
    }
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = jobPostingSchema.safeParse({
      title,
      employmentType: employmentType || undefined,
      location: location || undefined,
      salaryMin: salaryMin ?? undefined,
      salaryMax: salaryMax ?? undefined,
      salaryCompetitiveOnly,
      applicationDeadline: applicationDeadline
        ? new Date(applicationDeadline).toISOString()
        : undefined,
      descriptionHtml: descriptionHtml || undefined,
      requirements: requirementsHtml || undefined,
    });

    if (!parsed.success) {
      const fieldErrors: FormErrors = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        if (typeof path === "string") {
          fieldErrors[path] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setSaving(true);

    try {
      const res = await fetch("/api/v1/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...parsed.data,
          culturalContextJson,
          descriptionIgboHtml: showIgboEditor && descriptionIgboHtml ? descriptionIgboHtml : null,
        }),
      });

      const body = (await res.json()) as { data?: { id: string } };

      if (res.ok && body.data) {
        savedRef.current = true;
        setIsDirty(false);
        toast.success(t("created"));
        if (onSuccess) {
          onSuccess(body.data.id);
        } else {
          router.push("/my-jobs");
        }
      } else if (res.status === 403) {
        toast.error(t("companyRequired"));
      } else {
        toast.error(t("errorGeneric"));
      }
    } catch {
      toast.error(t("errorGeneric"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {/* Job Details section */}
      <section className="space-y-4">
        {/* Title */}
        <div className="space-y-1">
          <label htmlFor="job-title" className="block text-sm font-medium">
            {t("title")}
          </label>
          <input
            id="job-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("titlePlaceholder")}
            maxLength={200}
            aria-describedby={errors.title ? "job-title-error" : undefined}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          {errors.title && (
            <p id="job-title-error" role="alert" className="text-xs text-destructive">
              {errors.title}
            </p>
          )}
        </div>

        {/* Employment Type */}
        <div className="space-y-1">
          <label htmlFor="employment-type" className="block text-sm font-medium">
            {t("employmentType")}
          </label>
          <select
            id="employment-type"
            value={employmentType}
            onChange={(e) => setEmploymentType(e.target.value)}
            aria-describedby={errors.employmentType ? "employment-type-error" : undefined}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{t("employmentTypePlaceholder")}</option>
            {EMPLOYMENT_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {t(`type.${type}`)}
              </option>
            ))}
          </select>
          {errors.employmentType && (
            <p id="employment-type-error" role="alert" className="text-xs text-destructive">
              {errors.employmentType}
            </p>
          )}
        </div>

        {/* Location */}
        <div className="space-y-1">
          <label htmlFor="job-location" className="block text-sm font-medium">
            {t("location")}
          </label>
          <input
            id="job-location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t("locationPlaceholder")}
            maxLength={200}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </section>

      {/* Cultural Context section */}
      <CulturalContextToggles value={culturalContextJson} onChange={setCulturalContextJson} />

      {/* Salary section */}
      <SalaryRangeInput
        min={salaryMin}
        max={salaryMax}
        competitiveOnly={salaryCompetitiveOnly}
        onMinChange={setSalaryMin}
        onMaxChange={setSalaryMax}
        onCompetitiveOnlyChange={setSalaryCompetitiveOnly}
        errors={{
          min: errors.salaryMin,
          max: errors.salaryMax,
        }}
      />

      {/* Deadline section */}
      <div className="space-y-1">
        <label htmlFor="application-deadline" className="block text-sm font-medium">
          {t("applicationDeadline")}
        </label>
        <input
          id="application-deadline"
          type="date"
          value={applicationDeadline}
          onChange={(e) => setApplicationDeadline(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-xs text-muted-foreground">{t("applicationDeadlineHelp")}</p>
      </div>

      {/* Description (English Tiptap — lazy loaded) */}
      <div className="space-y-1">
        <label className="block text-sm font-medium">{t("description")}</label>
        <PortalRichTextEditor
          content={descriptionHtml}
          onChange={setDescriptionHtml}
          placeholder={t("descriptionPlaceholder")}
          aria-label={t("description")}
        />
      </div>

      {/* Requirements (Tiptap — lazy loaded) */}
      <div className="space-y-1">
        <label className="block text-sm font-medium">{t("requirements")}</label>
        <PortalRichTextEditor
          content={requirementsHtml}
          onChange={setRequirementsHtml}
          placeholder={t("requirementsPlaceholder")}
          aria-label={t("requirements")}
        />
      </div>

      {/* Add Igbo Description toggle + Igbo editor */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <input
            id="add-igbo-description"
            type="checkbox"
            checked={showIgboEditor}
            onChange={(e) => setShowIgboEditor(e.target.checked)}
            aria-describedby="add-igbo-description-help"
            className="h-4 w-4 rounded border-input"
          />
          <label htmlFor="add-igbo-description" className="text-sm font-medium">
            {t("addIgboDescription")}
          </label>
        </div>
        <p id="add-igbo-description-help" className="text-xs text-muted-foreground">
          {t("addIgboDescriptionHelp")}
        </p>
        {showIgboEditor && (
          <div className="space-y-1">
            <label className="block text-sm font-medium">{t("descriptionIgbo")}</label>
            <PortalRichTextEditor
              content={descriptionIgboHtml}
              onChange={setDescriptionIgboHtml}
              placeholder={t("descriptionIgboPlaceholder")}
              aria-label={t("descriptionIgbo")}
            />
          </div>
        )}
      </div>

      {/* Submit button */}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
        >
          {saving ? t("saving") : t("save")}
        </button>
      </div>
    </form>
  );
}

export function JobPostingFormSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-10 w-full animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
