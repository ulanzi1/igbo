"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { seekerProfileSchema } from "@/lib/validations/seeker-profile";
import type {
  PortalSeekerProfile,
  SeekerExperience,
  SeekerEducation,
} from "@igbo/db/schema/portal-seeker-profiles";

interface SeekerProfileFormProps {
  mode: "create" | "edit";
  initialData?: PortalSeekerProfile;
  prefill?: { displayName: string | null; bio: string | null };
  onSuccess?: (profile: unknown) => void;
}

interface FieldErrors {
  headline?: string;
  summary?: string;
  skills?: string;
  experience?: string;
  education?: string;
}

export function SeekerProfileForm({
  mode,
  initialData,
  prefill,
  onSuccess,
}: SeekerProfileFormProps) {
  const t = useTranslations("Portal.seeker");
  const router = useRouter();

  const hasPrefill = mode === "create" && !!(prefill?.displayName || prefill?.bio);

  const [headline, setHeadline] = React.useState(
    mode === "create" ? (prefill?.displayName ?? "") : (initialData?.headline ?? ""),
  );
  const [summary, setSummary] = React.useState(
    mode === "create" ? (prefill?.bio ?? "") : (initialData?.summary ?? ""),
  );
  const [skills, setSkills] = React.useState<string[]>(
    mode === "edit" ? (initialData?.skills ?? []) : [],
  );
  const [skillInput, setSkillInput] = React.useState("");
  const [experience, setExperience] = React.useState<SeekerExperience[]>(
    mode === "edit" ? ((initialData?.experienceJson as SeekerExperience[]) ?? []) : [],
  );
  const [education, setEducation] = React.useState<SeekerEducation[]>(
    mode === "edit" ? ((initialData?.educationJson as SeekerEducation[]) ?? []) : [],
  );
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [saving, setSaving] = React.useState(false);

  const headlineRef = React.useRef<HTMLInputElement>(null);
  const expRefs = React.useRef<Array<HTMLInputElement | null>>([]);
  const eduRefs = React.useRef<Array<HTMLInputElement | null>>([]);

  // --- Skills tag input ---
  function commitSkill(value: string) {
    const trimmed = value.trim().replace(/,$/, "").trim();
    if (!trimmed) return;
    if (skills.length >= 30) {
      setErrors((e) => ({ ...e, skills: t("skillsCapReached") }));
      return;
    }
    if (trimmed.length > 50) {
      setErrors((e) => ({ ...e, skills: t("skillTooLong") }));
      return;
    }
    if (skills.some((s) => s.toLowerCase() === trimmed.toLowerCase())) {
      setErrors((e) => ({ ...e, skills: t("skillDuplicate") }));
      return;
    }
    setErrors((e) => ({ ...e, skills: undefined }));
    setSkills((prev) => [...prev, trimmed]);
    setSkillInput("");
  }

  function handleSkillKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitSkill(skillInput);
    } else if (e.key === "Backspace" && skillInput === "" && skills.length > 0) {
      setSkills((prev) => prev.slice(0, -1));
    }
  }

  function removeSkill(idx: number) {
    setSkills((prev) => prev.filter((_, i) => i !== idx));
    // Focus back to skill input
    const inputEl = document.getElementById("skills-input") as HTMLInputElement | null;
    inputEl?.focus();
  }

  // --- Experience ---
  function addExperience() {
    const newEntry: SeekerExperience = {
      title: "",
      company: "",
      startDate: "",
      endDate: "",
      description: "",
    };
    setExperience((prev) => {
      const next = [...prev, newEntry];
      // Focus new row after state update
      setTimeout(() => {
        expRefs.current[next.length - 1]?.focus();
      }, 0);
      return next;
    });
  }

  function removeExperience(idx: number) {
    setExperience((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      // Focus next row or add button
      setTimeout(() => {
        if (expRefs.current[idx]) {
          expRefs.current[idx]?.focus();
        } else if (next.length > 0) {
          expRefs.current[next.length - 1]?.focus();
        } else {
          document.getElementById("add-experience-btn")?.focus();
        }
      }, 0);
      return next;
    });
  }

  function updateExperience(idx: number, field: keyof SeekerExperience, value: string) {
    setExperience((prev) =>
      prev.map((entry, i) => (i === idx ? { ...entry, [field]: value } : entry)),
    );
  }

  function togglePresent(idx: number, checked: boolean) {
    setExperience((prev) =>
      prev.map((entry, i) => (i === idx ? { ...entry, endDate: checked ? "Present" : "" } : entry)),
    );
  }

  // --- Education ---
  function addEducation() {
    const newEntry: SeekerEducation = {
      institution: "",
      degree: "",
      field: "",
      graduationYear: new Date().getFullYear(),
    };
    setEducation((prev) => {
      const next = [...prev, newEntry];
      setTimeout(() => {
        eduRefs.current[next.length - 1]?.focus();
      }, 0);
      return next;
    });
  }

  function removeEducation(idx: number) {
    setEducation((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      setTimeout(() => {
        if (next.length > 0) {
          eduRefs.current[next.length - 1]?.focus();
        } else {
          document.getElementById("add-education-btn")?.focus();
        }
      }, 0);
      return next;
    });
  }

  function updateEducation(idx: number, field: keyof SeekerEducation, value: string | number) {
    setEducation((prev) =>
      prev.map((entry, i) => (i === idx ? { ...entry, [field]: value } : entry)),
    );
  }

  // --- Submit ---
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const payload = {
      headline,
      summary: summary || undefined,
      skills,
      experience,
      education,
    };

    const parsed = seekerProfileSchema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = (issue?.path[0] as string | undefined) ?? "headline";
      setErrors({ [field]: issue?.message ?? "Validation error" });
      // Focus first error field
      if (field === "headline") {
        headlineRef.current?.focus();
      }
      return;
    }

    setSaving(true);
    try {
      const url = mode === "create" ? "/api/v1/seekers" : `/api/v1/seekers/${initialData!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (res.status === 409) {
        toast.error(t("errorDuplicate"));
        return;
      }

      if (!res.ok) {
        toast.error(t("errorGeneric"));
        return;
      }

      const json = (await res.json()) as { data: unknown };
      toast.success(mode === "create" ? t("successCreated") : t("successUpdated"));
      onSuccess?.(json.data);
      router.replace("/profile");
    } catch {
      toast.error(t("errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {hasPrefill && (
        <div
          className="mb-4 rounded-md bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-300"
          role="status"
        >
          {t("prefilledBanner")}
        </div>
      )}

      {/* Headline */}
      <div className="mb-4 flex flex-col gap-1">
        <Label htmlFor="headline">{t("headlineLabel")}</Label>
        <Input
          id="headline"
          ref={headlineRef}
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          placeholder={t("headlinePlaceholder")}
          maxLength={200}
          aria-describedby={errors.headline ? "headline-error" : "headline-help"}
          aria-invalid={!!errors.headline}
          required
        />
        <p id="headline-help" className="text-xs text-muted-foreground">
          {t("headlineHelp")}
        </p>
        {errors.headline && (
          <p id="headline-error" className="text-xs text-destructive" role="alert">
            {errors.headline}
          </p>
        )}
      </div>

      {/* Summary */}
      <div className="mb-4 flex flex-col gap-1">
        <Label htmlFor="summary">{t("summaryLabel")}</Label>
        <Textarea
          id="summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder={t("summaryPlaceholder")}
          maxLength={5000}
          rows={4}
          aria-describedby="summary-char-count"
        />
        <p
          id="summary-char-count"
          className="text-right text-xs text-muted-foreground"
          aria-live="polite"
        >
          {summary.length}/5000
        </p>
      </div>

      {/* Skills */}
      <div className="mb-6 flex flex-col gap-1" role="group" aria-labelledby="skills-label">
        <Label id="skills-label" htmlFor="skills-input">
          {t("skillsLabel")}
        </Label>
        <div className="flex flex-wrap gap-1 rounded-md border p-2">
          {skills.map((skill, i) => (
            <Badge key={i} variant="secondary" className="flex items-center gap-1">
              {skill}
              <button
                type="button"
                aria-label={`Remove skill ${skill}`}
                className="ml-1 text-xs hover:text-destructive"
                onClick={() => removeSkill(i)}
              >
                ×
              </button>
            </Badge>
          ))}
          <input
            id="skills-input"
            type="text"
            className="min-w-[120px] flex-1 border-none bg-transparent p-0 text-sm outline-none"
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={handleSkillKeyDown}
            onBlur={() => commitSkill(skillInput)}
            placeholder={skills.length === 0 ? t("skillsPlaceholder") : ""}
            aria-describedby="skills-help"
          />
        </div>
        <p id="skills-help" className="text-xs text-muted-foreground">
          {t("skillsHelp")}
        </p>
        {errors.skills && (
          <p className="text-xs text-destructive" role="alert">
            {errors.skills}
          </p>
        )}
      </div>

      {/* Experience */}
      <div className="mb-6 flex flex-col gap-3">
        <h2 id="experience-label" className="font-medium">
          {t("experienceLabel")}
        </h2>
        {experience.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("experienceEmpty")}</p>
        )}
        {experience.map((entry, i) => {
          const isPresent = entry.endDate === "Present";
          return (
            <div
              key={i}
              role="group"
              aria-labelledby={`exp-${i}-legend`}
              className="rounded-md border p-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 id={`exp-${i}-legend`} className="sr-only">
                  {t("ariaLabelExperienceGroup", { index: i + 1 })}
                </h3>
                <button
                  type="button"
                  aria-label={t("experienceRemove")}
                  className="ml-auto text-xs text-destructive hover:underline"
                  onClick={() => removeExperience(i)}
                >
                  {t("experienceRemove")}
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`exp-${i}-title`}>{t("experienceTitle")}</Label>
                  <Input
                    id={`exp-${i}-title`}
                    ref={(el) => {
                      expRefs.current[i] = el;
                    }}
                    value={entry.title}
                    onChange={(e) => updateExperience(i, "title", e.target.value)}
                    maxLength={200}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`exp-${i}-company`}>{t("experienceCompany")}</Label>
                  <Input
                    id={`exp-${i}-company`}
                    value={entry.company}
                    onChange={(e) => updateExperience(i, "company", e.target.value)}
                    maxLength={200}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`exp-${i}-start`}>{t("experienceStartDate")}</Label>
                  <Input
                    id={`exp-${i}-start`}
                    type="month"
                    value={entry.startDate}
                    onChange={(e) => updateExperience(i, "startDate", e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`exp-${i}-end`}>{t("experienceEndDate")}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id={`exp-${i}-end`}
                      type="month"
                      value={isPresent ? "" : entry.endDate}
                      disabled={isPresent}
                      onChange={(e) => updateExperience(i, "endDate", e.target.value)}
                    />
                    <label className="flex items-center gap-1 text-sm">
                      <input
                        type="checkbox"
                        checked={isPresent}
                        onChange={(e) => togglePresent(i, e.target.checked)}
                      />
                      {t("experiencePresent")}
                    </label>
                  </div>
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <Label htmlFor={`exp-${i}-desc`}>{t("experienceDescription")}</Label>
                  <Textarea
                    id={`exp-${i}-desc`}
                    value={entry.description ?? ""}
                    onChange={(e) => updateExperience(i, "description", e.target.value)}
                    maxLength={2000}
                    rows={2}
                  />
                </div>
              </div>
            </div>
          );
        })}
        {experience.length > 0 && <Separator />}
        <Button
          id="add-experience-btn"
          type="button"
          variant="outline"
          size="sm"
          onClick={addExperience}
          aria-label={t("experienceAdd")}
        >
          {t("experienceAdd")}
        </Button>
      </div>

      {/* Education */}
      <div className="mb-6 flex flex-col gap-3">
        <h2 id="education-label" className="font-medium">
          {t("educationLabel")}
        </h2>
        {education.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("educationEmpty")}</p>
        )}
        {education.map((entry, i) => (
          <div
            key={i}
            role="group"
            aria-labelledby={`edu-${i}-legend`}
            className="rounded-md border p-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 id={`edu-${i}-legend`} className="sr-only">
                {t("ariaLabelEducationGroup", { index: i + 1 })}
              </h3>
              <button
                type="button"
                aria-label={t("educationRemove")}
                className="ml-auto text-xs text-destructive hover:underline"
                onClick={() => removeEducation(i)}
              >
                {t("educationRemove")}
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label htmlFor={`edu-${i}-institution`}>{t("educationInstitution")}</Label>
                <Input
                  id={`edu-${i}-institution`}
                  ref={(el) => {
                    eduRefs.current[i] = el;
                  }}
                  value={entry.institution}
                  onChange={(e) => updateEducation(i, "institution", e.target.value)}
                  maxLength={200}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`edu-${i}-degree`}>{t("educationDegree")}</Label>
                <Input
                  id={`edu-${i}-degree`}
                  value={entry.degree}
                  onChange={(e) => updateEducation(i, "degree", e.target.value)}
                  maxLength={100}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`edu-${i}-field`}>{t("educationField")}</Label>
                <Input
                  id={`edu-${i}-field`}
                  value={entry.field}
                  onChange={(e) => updateEducation(i, "field", e.target.value)}
                  maxLength={100}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`edu-${i}-year`}>{t("educationGraduationYear")}</Label>
                <Input
                  id={`edu-${i}-year`}
                  type="number"
                  min={1950}
                  max={new Date().getFullYear() + 7}
                  value={entry.graduationYear}
                  onChange={(e) =>
                    updateEducation(i, "graduationYear", parseInt(e.target.value, 10) || 0)
                  }
                />
              </div>
            </div>
          </div>
        ))}
        {education.length > 0 && <Separator />}
        <Button
          id="add-education-btn"
          type="button"
          variant="outline"
          size="sm"
          onClick={addEducation}
          aria-label={t("educationAdd")}
        >
          {t("educationAdd")}
        </Button>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button type="submit" aria-busy={saving} disabled={saving}>
          {mode === "create" ? t("saveCreate") : t("saveUpdate")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.replace(mode === "create" ? "/" : "/profile")}
        >
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

export function SeekerProfileFormSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-8 w-full animate-pulse rounded bg-muted" />
      <div className="h-24 w-full animate-pulse rounded bg-muted" />
      <div className="h-10 w-1/2 animate-pulse rounded bg-muted" />
    </div>
  );
}
