"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { z } from "zod";
import PhoneInput from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import "react-phone-number-input/style.css";
import { Country, State } from "country-state-city";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApplicationStepper } from "@/features/auth/components/ApplicationStepper";
import { submitApplication } from "@/features/auth/actions/submit-application";
import { resendVerification } from "@/features/auth/actions/resend-verification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ApplicationFormValues, GeoDefaults } from "@/features/auth/types/application";

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

const applicationSchema = z.object({
  name: z.string().min(1, "Full name is required").max(255),
  email: z.string().min(1, "Email address is required").email("Please enter a valid email address"),
  phone: z
    .string()
    .refine((v) => !v || E164_REGEX.test(v), "Please enter a valid phone number with country code")
    .optional()
    .or(z.literal("")),
  locationCity: z.string().min(1, "City is required").max(255),
  locationState: z.string().max(255).optional().or(z.literal("")),
  locationCountry: z.string().min(1, "Country is required").max(255),
  culturalConnection: z
    .string()
    .min(1, "Please describe your cultural connection")
    .max(2000, "Maximum 2000 characters"),
  reasonForJoining: z
    .string()
    .min(10, "Please provide more detail (minimum 10 characters)")
    .max(2000, "Maximum 2000 characters"),
  referralName: z.string().max(255).optional().or(z.literal("")),
  consentGiven: z.boolean().refine((v) => v === true, {
    message: "You must consent to the Privacy Policy to submit your application",
  }),
});

const TOTAL_STEPS = 5;

const ALL_COUNTRIES = Country.getAllCountries().sort((a, b) => a.name.localeCompare(b.name));

// Fields validated at each step boundary (before advancing)
const STEP_FIELDS: (keyof ApplicationFormValues)[][] = [
  ["name", "email", "phone"],
  ["locationCity", "locationState", "locationCountry"],
  ["culturalConnection"],
  ["reasonForJoining"],
  ["referralName", "consentGiven"],
];

type FormStatus =
  | "idle"
  | "submitting"
  | "submitted"
  | "resending"
  | "resent"
  | "resendError"
  | "error";

interface ApplicationFormProps {
  geoDefaults: GeoDefaults;
}

export function ApplicationForm({ geoDefaults }: ApplicationFormProps) {
  const t = useTranslations("Apply");
  const [currentStep, setCurrentStep] = useState(1);
  const [formStatus, setFormStatus] = useState<FormStatus>("idle");
  const [submitError, setSubmitError] = useState<{ field?: string; message: string } | null>(null);
  const [resendEmail, setResendEmail] = useState("");
  const [resendMessage, setResendMessage] = useState("");
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);

  const {
    register,
    control,
    handleSubmit,
    trigger,
    setError,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ApplicationFormValues>({
    mode: "onBlur",
    resolver: zodResolver(applicationSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      locationCity: geoDefaults.city,
      locationState: geoDefaults.state,
      locationCountry: ALL_COUNTRIES.find((c) => c.isoCode === geoDefaults.country)?.name ?? "",
      culturalConnection: "",
      reasonForJoining: "",
      referralName: "",
      consentGiven: false,
    },
  });

  const watchedCountry = watch("locationCountry");

  const countryIsoCode = useMemo(
    () => ALL_COUNTRIES.find((c) => c.name === watchedCountry)?.isoCode ?? "",
    [watchedCountry],
  );

  const stateOptions = useMemo(
    () => (countryIsoCode ? State.getStatesOfCountry(countryIsoCode) : []),
    [countryIsoCode],
  );

  // Focus step heading on step transitions
  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [currentStep]);

  async function handleNext() {
    const fields = STEP_FIELDS[currentStep - 1] ?? [];
    const valid = await trigger(fields);
    if (valid) {
      setCurrentStep((s) => s + 1);
    }
  }

  function handleBack() {
    setCurrentStep((s) => s - 1);
  }

  async function onSubmit(values: ApplicationFormValues) {
    setFormStatus("submitting");
    setSubmitError(null);

    const result = await submitApplication(values);

    if (result.success) {
      setFormStatus("submitted");
    } else {
      setFormStatus("error");
      const err = result.error;
      if ("field" in err) {
        setError(err.field as keyof ApplicationFormValues, { message: err.message });
        setSubmitError(err);
        // Navigate back to step containing the error field
        const errorStepIndex = STEP_FIELDS.findIndex((fields) =>
          fields.includes(err.field as keyof ApplicationFormValues),
        );
        if (errorStepIndex !== -1) {
          setCurrentStep(errorStepIndex + 1);
        }
      } else {
        setSubmitError({ message: err.message });
      }
    }
  }

  async function handleResend(e: React.FormEvent) {
    e.preventDefault();
    if (!resendEmail) return;
    setFormStatus("resending");
    setResendMessage("");

    const result = await resendVerification(resendEmail);
    if (result.success) {
      setFormStatus("resent");
      setResendMessage(t("confirmation.resendSuccess"));
    } else {
      setFormStatus("resendError");
      setResendMessage(result.error);
    }
  }

  // Confirmation state (after successful submission)
  if (
    formStatus === "submitted" ||
    formStatus === "resending" ||
    formStatus === "resent" ||
    formStatus === "resendError"
  ) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-primary mb-4">{t("confirmation.title")}</h1>
        <p className="text-base text-muted-foreground mb-8">{t("confirmation.description")}</p>

        <form onSubmit={handleResend} className="flex flex-col items-center gap-4 max-w-sm mx-auto">
          <p className="text-sm text-muted-foreground">{t("confirmation.resendPrompt")}</p>
          <Input
            type="email"
            value={resendEmail}
            onChange={(e) => setResendEmail(e.target.value)}
            placeholder={t("confirmation.emailPlaceholder")}
            aria-label={t("fields.email")}
            className="w-full"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={formStatus === "resending" || !resendEmail}
            className="w-full"
          >
            {formStatus === "resending" ? t("resending") : t("resend")}
          </Button>
          {resendMessage && (
            <p
              className={
                formStatus === "resent" ? "text-sm text-green-600" : "text-sm text-destructive"
              }
              role="status"
              aria-live="polite"
            >
              {resendMessage}
            </p>
          )}
        </form>
      </div>
    );
  }

  const stepTitles = [
    t("stepLabels.basicInfo"),
    t("stepLabels.location"),
    t("stepLabels.culturalConnection"),
    t("stepLabels.reasonForJoining"),
    t("stepLabels.consentAndReferral"),
  ];

  const hasGeoDefaults = geoDefaults.city || geoDefaults.country;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl md:text-4xl font-bold text-primary mb-2 text-center">
        {t("heading")}
      </h1>
      <p className="text-base text-muted-foreground mb-6 text-center">{t("description")}</p>

      <ApplicationStepper currentStep={currentStep} />

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <h2
          ref={stepHeadingRef}
          tabIndex={-1}
          className="text-xl font-semibold mb-6 focus:outline-none"
        >
          {stepTitles[currentStep - 1]}
        </h2>

        {/* Step 1: Basic Info */}
        {currentStep === 1 && (
          <div className="flex flex-col gap-5">
            <div>
              <Label htmlFor="name">{t("fields.name")}</Label>
              <Input
                id="name"
                type="text"
                autoComplete="name"
                aria-required="true"
                aria-describedby={errors.name ? "name-error" : undefined}
                {...register("name")}
              />
              {errors.name && (
                <p id="name-error" className="text-sm text-destructive mt-1" role="alert">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="email">{t("fields.email")}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                aria-required="true"
                aria-describedby={errors.email ? "email-error" : undefined}
                {...register("email")}
              />
              {errors.email && (
                <p id="email-error" className="text-sm text-destructive mt-1" role="alert">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="phone">
                {t("fields.phone")}{" "}
                <span className="text-muted-foreground text-sm">{t("optional")}</span>
              </Label>
              <Controller
                name="phone"
                control={control}
                render={({ field }) => (
                  <PhoneInput
                    flags={flags}
                    id="phone"
                    international
                    defaultCountry="NG"
                    value={field.value}
                    onChange={(value) => field.onChange(value ?? "")}
                    onBlur={field.onBlur}
                    aria-describedby={errors.phone ? "phone-error" : undefined}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                )}
              />
              {errors.phone && (
                <p id="phone-error" className="text-sm text-destructive mt-1" role="alert">
                  {errors.phone.message}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Location */}
        {currentStep === 2 && (
          <div className="flex flex-col gap-5">
            {!hasGeoDefaults && (
              <p className="text-sm text-muted-foreground bg-muted rounded-lg px-4 py-3">
                {t("locationNotDetected")}
              </p>
            )}

            <div className="md:grid md:grid-cols-2 md:gap-4 flex flex-col gap-5">
              <div>
                <Label htmlFor="locationCity">{t("fields.locationCity")}</Label>
                <Input
                  id="locationCity"
                  type="text"
                  autoComplete="address-level2"
                  aria-required="true"
                  aria-describedby={errors.locationCity ? "city-error" : undefined}
                  {...register("locationCity")}
                />
                {errors.locationCity && (
                  <p id="city-error" className="text-sm text-destructive mt-1" role="alert">
                    {errors.locationCity.message}
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="locationCountry">{t("fields.locationCountry")}</Label>
                <Controller
                  name="locationCountry"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        setValue("locationState", "");
                      }}
                    >
                      <SelectTrigger
                        id="locationCountry"
                        className="w-full"
                        aria-required="true"
                        aria-describedby={errors.locationCountry ? "country-error" : undefined}
                      >
                        <SelectValue placeholder={t("fields.locationCountryPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_COUNTRIES.map((country) => (
                          <SelectItem key={country.isoCode} value={country.name}>
                            {country.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.locationCountry && (
                  <p id="country-error" className="text-sm text-destructive mt-1" role="alert">
                    {errors.locationCountry.message}
                  </p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="locationState">
                {t("fields.locationState")}{" "}
                <span className="text-muted-foreground text-sm">{t("optional")}</span>
              </Label>
              {stateOptions.length > 0 ? (
                <Controller
                  name="locationState"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="locationState" className="w-full">
                        <SelectValue placeholder={t("fields.locationStatePlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {stateOptions.map((state) => (
                          <SelectItem key={state.isoCode} value={state.name}>
                            {state.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              ) : (
                <Input
                  id="locationState"
                  type="text"
                  autoComplete="address-level1"
                  {...register("locationState")}
                />
              )}
            </div>
          </div>
        )}

        {/* Step 3: Cultural Connection */}
        {currentStep === 3 && (
          <div className="flex flex-col gap-5">
            <div>
              <Label htmlFor="culturalConnection">{t("fields.culturalConnection")}</Label>
              <p className="text-sm text-muted-foreground mb-2">
                {t("fields.culturalConnectionHelp")}
              </p>
              <textarea
                id="culturalConnection"
                rows={6}
                aria-required="true"
                aria-describedby={errors.culturalConnection ? "cultural-error" : undefined}
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                {...register("culturalConnection")}
              />
              {errors.culturalConnection && (
                <p id="cultural-error" className="text-sm text-destructive mt-1" role="alert">
                  {errors.culturalConnection.message}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Reason for Joining */}
        {currentStep === 4 && (
          <div className="flex flex-col gap-5">
            <div>
              <Label htmlFor="reasonForJoining">{t("fields.reasonForJoining")}</Label>
              <p className="text-sm text-muted-foreground mb-2">
                {t("fields.reasonForJoiningHelp")}
              </p>
              <textarea
                id="reasonForJoining"
                rows={6}
                aria-required="true"
                aria-describedby={errors.reasonForJoining ? "reason-error" : undefined}
                className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                {...register("reasonForJoining")}
              />
              {errors.reasonForJoining && (
                <p id="reason-error" className="text-sm text-destructive mt-1" role="alert">
                  {errors.reasonForJoining.message}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Step 5: Referral + Consent */}
        {currentStep === 5 && (
          <div className="flex flex-col gap-5">
            <div>
              <Label htmlFor="referralName">
                {t("fields.referralName")}{" "}
                <span className="text-muted-foreground text-sm">{t("optional")}</span>
              </Label>
              <p className="text-sm text-muted-foreground mb-2">{t("fields.referralNameHelp")}</p>
              <Input id="referralName" type="text" {...register("referralName")} />
            </div>

            <div className="rounded-xl border border-border bg-muted/50 p-4">
              <div className="flex items-start gap-3">
                <Controller
                  name="consentGiven"
                  control={control}
                  render={({ field }) => (
                    <input
                      id="consentGiven"
                      type="checkbox"
                      checked={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      aria-required="true"
                      aria-describedby={errors.consentGiven ? "consent-error" : undefined}
                      className="mt-1 h-4 w-4 rounded border border-input accent-primary cursor-pointer"
                    />
                  )}
                />
                <Label htmlFor="consentGiven" className="text-sm leading-relaxed cursor-pointer">
                  {t("fields.consent")}
                </Label>
              </div>
              {errors.consentGiven && (
                <p id="consent-error" className="text-sm text-destructive mt-2" role="alert">
                  {errors.consentGiven.message}
                </p>
              )}
            </div>

            {submitError && !submitError.field && (
              <p className="text-sm text-destructive" role="alert">
                {submitError.message}
              </p>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8 gap-4">
          {currentStep > 1 && (
            <Button type="button" variant="outline" onClick={handleBack} className="min-h-[44px]">
              {t("back")}
            </Button>
          )}
          <div className={currentStep === 1 ? "w-full" : "ml-auto"}>
            {currentStep < TOTAL_STEPS ? (
              <Button type="button" onClick={handleNext} className="min-h-[44px] w-full">
                {t("next")}
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={formStatus === "submitting"}
                className="min-h-[44px] w-full"
              >
                {formStatus === "submitting" ? t("submitting") : t("submit")}
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
