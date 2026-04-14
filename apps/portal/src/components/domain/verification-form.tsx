"use client";

import * as React from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { VerificationDocumentUpload } from "./verification-document-upload";
import type { UploadedDocument } from "./verification-document-upload";

export function VerificationForm({ companyId }: { companyId: string }) {
  const t = useTranslations("Portal.verification");
  const locale = useLocale();
  const router = useRouter();

  const [documents, setDocuments] = React.useState<UploadedDocument[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [successMsg, setSuccessMsg] = React.useState<string | undefined>();
  const [errorMsg, setErrorMsg] = React.useState<string | undefined>();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (documents.length === 0) {
      setErrorMsg(t("fileRequired"));
      return;
    }
    setSubmitting(true);
    setErrorMsg(undefined);
    try {
      const res = await fetch(`/api/v1/companies/${companyId}/verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string; status?: number };
        if (res.status === 409) {
          setErrorMsg(t("alreadyPending"));
        } else {
          setErrorMsg(body.detail ?? t("error"));
        }
        return;
      }
      setSuccessMsg(t("success"));
    } finally {
      setSubmitting(false);
    }
  }

  if (successMsg) {
    return (
      <div
        className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
        role="status"
        data-testid="success-message"
      >
        {successMsg}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <VerificationDocumentUpload onDocumentsChange={setDocuments} />

      {errorMsg && (
        <p className="text-sm text-destructive" role="alert" data-testid="submit-error">
          {errorMsg}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={submitting || documents.length === 0}>
          {submitting ? t("submitting") : t("submit")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(`/${locale}/company-profile`)}
        >
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
