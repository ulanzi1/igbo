"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { CreateEventInput } from "@/services/event-service";

// Curated static list of common IANA timezones (NOT Intl.supportedValuesOf — requires Chrome 99+)
const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
];

interface EventFormProps {
  initialData?: Partial<CreateEventInput>;
  mode: "create" | "edit";
  onSuccess?: (eventId: string) => void;
  userGroups?: { id: string; name: string }[];
  eventId?: string; // required when mode='edit'
}

export function EventForm({
  initialData,
  mode,
  onSuccess,
  userGroups = [],
  eventId,
}: EventFormProps) {
  const t = useTranslations("Events");
  const router = useRouter();

  const [title, setTitle] = useState(initialData?.title ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [eventType, setEventType] = useState<"general" | "group">(
    initialData?.eventType ?? "general",
  );
  const [groupId, setGroupId] = useState(initialData?.groupId ?? "");
  const [format, setFormat] = useState<"virtual" | "in_person" | "hybrid">(
    initialData?.format ?? "virtual",
  );
  const [timezone, setTimezone] = useState(initialData?.timezone ?? "UTC");
  const [startTime, setStartTime] = useState(initialData?.startTime ?? "");
  const [endTime, setEndTime] = useState(initialData?.endTime ?? "");
  const [location, setLocation] = useState(initialData?.location ?? "");
  const [meetingLink, setMeetingLink] = useState(initialData?.meetingLink ?? "");
  const [registrationLimit, setRegistrationLimit] = useState(
    initialData?.registrationLimit ? String(initialData.registrationLimit) : "",
  );
  const [recurrencePattern, setRecurrencePattern] = useState<
    "none" | "daily" | "weekly" | "monthly"
  >(initialData?.recurrencePattern ?? "none");

  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = (): boolean => {
    if (!title.trim()) {
      setValidationError(t("validation.titleRequired"));
      return false;
    }
    if (!startTime || !endTime) {
      setValidationError(t("validation.startEndRequired"));
      return false;
    }
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (start <= new Date()) {
      setValidationError(t("validation.futureDate"));
      return false;
    }
    if (end <= start) {
      setValidationError(t("validation.endAfterStart"));
      return false;
    }
    if (
      registrationLimit &&
      (isNaN(parseInt(registrationLimit)) || parseInt(registrationLimit) <= 0)
    ) {
      setValidationError(t("validation.positiveLimit"));
      return false;
    }
    if (eventType === "group" && !groupId) {
      setValidationError(t("validation.groupRequired"));
      return false;
    }
    setValidationError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setServerError(null);
    setPermissionDenied(false);

    const payload: CreateEventInput = {
      title: title.trim(),
      description: description.trim() || undefined,
      eventType,
      groupId: eventType === "group" ? groupId : undefined,
      format,
      timezone,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      location: location.trim() || undefined,
      meetingLink: meetingLink.trim() || undefined,
      registrationLimit: registrationLimit ? parseInt(registrationLimit) : undefined,
      recurrencePattern,
    };

    try {
      let res: Response;
      if (mode === "create") {
        res = await fetch("/api/v1/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/v1/events/${eventId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
      }

      if (res.status === 403) {
        setPermissionDenied(true);
        setIsSubmitting(false);
        return;
      }

      if (!res.ok) {
        const data = (await res.json()) as { detail?: string };
        setServerError(data.detail ?? t("edit.error"));
        setIsSubmitting(false);
        return;
      }

      const data = (await res.json()) as { data?: { eventId?: string } };
      const newEventId = data.data?.eventId ?? eventId ?? "";

      if (onSuccess) {
        onSuccess(newEventId);
      } else {
        router.push(`/events/${newEventId}`);
      }
    } catch {
      setServerError(t("edit.error"));
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {permissionDenied && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-200">
          {t("permissions.createRequired")}
        </div>
      )}

      {(validationError || serverError) && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm text-destructive">
          {validationError ?? serverError}
        </div>
      )}

      {/* Title */}
      <div className="space-y-1.5">
        <label htmlFor="title" className="text-sm font-medium">
          {t("fields.title")} <span aria-hidden="true">*</span>
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("fields.titlePlaceholder")}
          required
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <label htmlFor="description" className="text-sm font-medium">
          {t("fields.description")}
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("fields.descriptionPlaceholder")}
          rows={4}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-y"
        />
      </div>

      {/* Event type (only on create) */}
      {mode === "create" && (
        <div className="space-y-1.5">
          <label htmlFor="eventType" className="text-sm font-medium">
            {t("fields.eventType")}
          </label>
          <select
            id="eventType"
            value={eventType}
            onChange={(e) => setEventType(e.target.value as "general" | "group")}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="general">{t("type.general")}</option>
            <option value="group">{t("type.group")}</option>
          </select>
        </div>
      )}

      {/* Group selector (only if eventType='group') */}
      {eventType === "group" && mode === "create" && (
        <div className="space-y-1.5">
          <label htmlFor="groupId" className="text-sm font-medium">
            {t("fields.group")} <span aria-hidden="true">*</span>
          </label>
          <select
            id="groupId"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{t("fields.groupPlaceholder")}</option>
            {userGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Format */}
      <div className="space-y-1.5">
        <label htmlFor="format" className="text-sm font-medium">
          {t("fields.format")}
        </label>
        <select
          id="format"
          value={format}
          onChange={(e) => setFormat(e.target.value as "virtual" | "in_person" | "hybrid")}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="virtual">{t("format.virtual")}</option>
          <option value="in_person">{t("format.inPerson")}</option>
          <option value="hybrid">{t("format.hybrid")}</option>
        </select>
      </div>

      {/* Start / End time */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="startTime" className="text-sm font-medium">
            {t("fields.startTime")} <span aria-hidden="true">*</span>
          </label>
          <input
            id="startTime"
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="endTime" className="text-sm font-medium">
            {t("fields.endTime")} <span aria-hidden="true">*</span>
          </label>
          <input
            id="endTime"
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Timezone */}
      <div className="space-y-1.5">
        <label htmlFor="timezone" className="text-sm font-medium">
          {t("fields.timezone")}
        </label>
        <select
          id="timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>

      {/* Location / Meeting link based on format */}
      {(format === "in_person" || format === "hybrid") && (
        <div className="space-y-1.5">
          <label htmlFor="location" className="text-sm font-medium">
            {t("fields.location")}
          </label>
          <input
            id="location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={t("fields.locationPlaceholder")}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      )}

      {(format === "virtual" || format === "hybrid") && (
        <div className="space-y-1.5">
          <label htmlFor="meetingLink" className="text-sm font-medium">
            {t("fields.meetingLink")}
          </label>
          <input
            id="meetingLink"
            type="url"
            value={meetingLink}
            onChange={(e) => setMeetingLink(e.target.value)}
            placeholder={t("fields.meetingLinkPlaceholder")}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      )}

      {/* Registration limit */}
      <div className="space-y-1.5">
        <label htmlFor="registrationLimit" className="text-sm font-medium">
          {t("fields.registrationLimit")}
        </label>
        <input
          id="registrationLimit"
          type="number"
          min={1}
          value={registrationLimit}
          onChange={(e) => setRegistrationLimit(e.target.value)}
          placeholder={t("fields.registrationLimitPlaceholder")}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Recurrence (only on create) */}
      {mode === "create" && (
        <div className="space-y-1.5">
          <label htmlFor="recurrencePattern" className="text-sm font-medium">
            {t("fields.recurrence")}
          </label>
          <select
            id="recurrencePattern"
            value={recurrencePattern}
            onChange={(e) =>
              setRecurrencePattern(e.target.value as "none" | "daily" | "weekly" | "monthly")
            }
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="none">{t("recurrence.none")}</option>
            <option value="daily">{t("recurrence.daily")}</option>
            <option value="weekly">{t("recurrence.weekly")}</option>
            <option value="monthly">{t("recurrence.monthly")}</option>
          </select>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isSubmitting || !title.trim()}
          className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-5 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {mode === "create" ? t("create.submitButton") : t("edit.submitButton")}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center justify-center rounded-md border border-input bg-background px-5 py-2 text-sm font-medium hover:bg-accent"
        >
          {t("create.cancelButton")}
        </button>
      </div>
    </form>
  );
}
