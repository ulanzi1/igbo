"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AccountSettingsPage() {
  const t = useTranslations("settings.account");

  // Account deletion state
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  // Data export state
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportRequestId, setExportRequestId] = useState<string | null>(null);

  const handleDeleteAccount = async () => {
    if (!deletePassword) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/v1/user/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { title?: string; detail?: string };
        setDeleteError(data.detail ?? data.title ?? t("deleteAccount.errorGeneric"));
      } else {
        setDeleteSuccess(true);
        setDeletePassword("");
      }
    } catch {
      setDeleteError(t("deleteAccount.errorGeneric"));
    } finally {
      setDeleting(false);
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    setExportError("");
    try {
      const res = await fetch("/api/v1/user/account/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = (await res.json()) as { title?: string; detail?: string };
        setExportError(data.detail ?? data.title ?? t("exportData.errorGeneric"));
      } else {
        const data = (await res.json()) as { requestId?: string };
        setExportRequestId(data.requestId ?? null);
      }
    } catch {
      setExportError(t("exportData.errorGeneric"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">{t("heading")}</h1>
      </div>

      {/* Export My Data */}
      <section className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">{t("exportData.heading")}</h2>
        <p className="text-sm text-muted-foreground">{t("exportData.description")}</p>
        {exportRequestId ? (
          <p className="text-sm text-green-600">{t("exportData.requested")}</p>
        ) : (
          <Button onClick={() => void handleExportData()} disabled={exporting} variant="outline">
            {exporting ? t("exportData.requesting") : t("exportData.button")}
          </Button>
        )}
        {exportError && <p className="text-sm text-destructive">{exportError}</p>}
        <p className="text-xs text-muted-foreground">{t("exportData.rateLimit")}</p>
      </section>

      {/* Delete My Account */}
      <section className="rounded-lg border border-destructive/30 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-destructive">{t("deleteAccount.heading")}</h2>
        <p className="text-sm text-muted-foreground">{t("deleteAccount.description")}</p>
        {deleteSuccess ? (
          <p className="text-sm text-green-600">{t("deleteAccount.success")}</p>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">{t("deleteAccount.button")}</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("deleteAccount.confirmTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("deleteAccount.confirmDescription")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2 py-2">
                <Label htmlFor="delete-password">{t("deleteAccount.passwordLabel")}</Label>
                <Input
                  id="delete-password"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder={t("deleteAccount.passwordPlaceholder")}
                />
                {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel
                  onClick={() => {
                    setDeletePassword("");
                    setDeleteError("");
                  }}
                >
                  {t("deleteAccount.cancel")}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void handleDeleteAccount()}
                  disabled={deleting || !deletePassword}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? t("deleteAccount.deleting") : t("deleteAccount.confirmButton")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </section>
    </div>
  );
}
