"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { resendVerification } from "@/features/auth/actions/resend-verification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ResendFormProps {
  emailPlaceholder: string;
}

export function ResendForm({ emailPlaceholder }: ResendFormProps) {
  const t = useTranslations("Apply");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("sending");
    setMessage("");

    const result = await resendVerification(email);
    if (result.success) {
      setStatus("sent");
      setMessage(t("confirmation.resendSuccess"));
    } else {
      setStatus("error");
      setMessage(result.error);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-center gap-3 max-w-sm mx-auto">
      <Input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={emailPlaceholder}
        aria-label={t("fields.email")}
        className="w-full"
        required
      />
      <Button
        type="submit"
        variant="outline"
        disabled={status === "sending" || !email}
        className="w-full min-h-[44px]"
      >
        {status === "sending" ? t("resending") : t("resend")}
      </Button>
      {message && (
        <p
          className={status === "sent" ? "text-sm text-green-600" : "text-sm text-destructive"}
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
      )}
    </form>
  );
}
