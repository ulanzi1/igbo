"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LogoUpload } from "@/components/domain/logo-upload";
import {
  companyProfileSchema,
  INDUSTRY_OPTIONS,
  COMPANY_SIZE_OPTIONS,
} from "@/lib/validations/company";
import type { PortalCompanyProfile } from "@igbo/db/schema/portal-company-profiles";

interface CompanyProfileFormProps {
  mode: "create" | "edit";
  initialData?: PortalCompanyProfile;
  onSuccess?: (profile: PortalCompanyProfile) => void;
  showOnboardingToast?: boolean;
}

interface FormState {
  name: string;
  logoUrl: string;
  description: string;
  industry: string;
  companySize: string;
  cultureInfo: string;
}

export function CompanyProfileForm({
  mode,
  initialData,
  onSuccess,
  showOnboardingToast,
}: CompanyProfileFormProps) {
  const t = useTranslations("Portal.company");
  const tIndustries = useTranslations("Portal.industries");

  React.useEffect(() => {
    if (showOnboardingToast) {
      toast.info(t("createProfileFirst"));
    }
  }, [showOnboardingToast, t]);

  const [form, setForm] = React.useState<FormState>({
    name: initialData?.name ?? "",
    logoUrl: initialData?.logoUrl ?? "",
    description: initialData?.description ?? "",
    industry: initialData?.industry ?? "",
    companySize: initialData?.companySize ?? "",
    cultureInfo: initialData?.cultureInfo ?? "",
  });

  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const payload = {
      name: form.name,
      logoUrl: form.logoUrl || undefined,
      description: form.description || undefined,
      industry: form.industry || undefined,
      companySize: form.companySize || undefined,
      cultureInfo: form.cultureInfo || undefined,
    };

    const parsed = companyProfileSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof FormState, string>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FormState;
        if (field) fieldErrors[field] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const url = mode === "create" ? "/api/v1/companies" : `/api/v1/companies/${initialData!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!res.ok) {
        if (res.status === 409) {
          toast.error(t("duplicateError"));
          return;
        }
        const errBody = await res.json().catch(() => ({}));
        toast.error(errBody.detail ?? t("errorGeneric"));
        return;
      }

      const responseBody: { data: PortalCompanyProfile } = await res.json();
      toast.success(mode === "create" ? t("created") : t("updated"));
      onSuccess?.(responseBody.data);
    } catch {
      toast.error(t("errorUnexpected"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
      {/* Logo */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="logo-upload">{t("logo")}</Label>
        <LogoUpload
          currentLogoUrl={form.logoUrl || undefined}
          onUploadComplete={(url) => setField("logoUrl", url)}
        />
      </div>

      {/* Company Name */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="company-name">{t("name")}</Label>
        <Input
          id="company-name"
          name="name"
          value={form.name}
          onChange={(e) => setField("name", e.target.value)}
          placeholder={t("namePlaceholder")}
          maxLength={200}
          aria-describedby={errors.name ? "company-name-error" : undefined}
          aria-invalid={!!errors.name}
          required
        />
        {errors.name && (
          <p id="company-name-error" role="alert" className="text-sm text-destructive">
            {errors.name}
          </p>
        )}
      </div>

      {/* Description */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="company-description">{t("description")}</Label>
        <Textarea
          id="company-description"
          name="description"
          value={form.description}
          onChange={(e) => setField("description", e.target.value)}
          placeholder={t("descriptionPlaceholder")}
          maxLength={5000}
          aria-describedby={errors.description ? "company-description-error" : undefined}
          aria-invalid={!!errors.description}
        />
        <p className="text-xs text-muted-foreground">{form.description.length}/5000</p>
        {errors.description && (
          <p id="company-description-error" role="alert" className="text-sm text-destructive">
            {errors.description}
          </p>
        )}
      </div>

      {/* Industry */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="company-industry">{t("industry")}</Label>
        <Select value={form.industry} onValueChange={(val) => setField("industry", val)}>
          <SelectTrigger id="company-industry" className="w-full">
            <SelectValue placeholder={t("industryPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {INDUSTRY_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {tIndustries(opt)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Company Size */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="company-size">{t("companySize")}</Label>
        <Select value={form.companySize} onValueChange={(val) => setField("companySize", val)}>
          <SelectTrigger id="company-size" className="w-full">
            <SelectValue placeholder={t("companySizePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {COMPANY_SIZE_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Culture Info */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="company-culture">{t("cultureInfo")}</Label>
        <Textarea
          id="company-culture"
          name="cultureInfo"
          value={form.cultureInfo}
          onChange={(e) => setField("cultureInfo", e.target.value)}
          placeholder={t("cultureInfoPlaceholder")}
          maxLength={5000}
          aria-describedby={errors.cultureInfo ? "company-culture-error" : undefined}
          aria-invalid={!!errors.cultureInfo}
        />
        <p className="text-xs text-muted-foreground">{form.cultureInfo.length}/5000</p>
        {errors.cultureInfo && (
          <p id="company-culture-error" role="alert" className="text-sm text-destructive">
            {errors.cultureInfo}
          </p>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t("saving") : t("save")}
      </Button>
    </form>
  );
}

export function CompanyProfileFormSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-24 w-24 animate-pulse rounded-lg bg-muted" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-11 w-full animate-pulse rounded-lg bg-muted" />
        </div>
      ))}
    </div>
  );
}
