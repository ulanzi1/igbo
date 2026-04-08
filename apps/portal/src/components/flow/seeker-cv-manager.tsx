"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { CvWithFile } from "@igbo/db/queries/portal-seeker-cvs";

const MAX_CVS = 5;
const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

interface SeekerCvManagerProps {
  initialCvs?: CvWithFile[];
}

export function SeekerCvManager({ initialCvs = [] }: SeekerCvManagerProps) {
  const t = useTranslations("Portal.seeker");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [cvs, setCvs] = React.useState<CvWithFile[]>(initialCvs);
  const [uploadLabel, setUploadLabel] = React.useState("");
  const [uploading, setUploading] = React.useState(false);

  const atLimit = cvs.length >= MAX_CVS;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error(t("cvFileTypeError"));
      e.target.value = "";
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      toast.error(t("cvFileSizeError"));
      e.target.value = "";
      return;
    }

    const label = uploadLabel.trim() || file.name;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("label", label);
      const res = await fetch("/api/v1/seekers/me/cvs", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body.extensions?.code === "PORTAL_ERRORS.CV_LIMIT_REACHED") {
          toast.error(t("cvLimitReached"));
        } else {
          toast.error(t("cvUploadError"));
        }
        return;
      }
      const body = await res.json();
      setCvs((prev) => [...prev, body.data]);
      setUploadLabel("");
      toast.success(t("cvUploadSuccess"));
    } catch {
      toast.error(t("cvUploadError"));
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function handleSetDefault(cvId: string) {
    try {
      const res = await fetch(`/api/v1/seekers/me/cvs/${cvId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      });
      if (!res.ok) {
        toast.error(t("cvSetDefaultError"));
        return;
      }
      setCvs((prev) => prev.map((cv) => ({ ...cv, isDefault: cv.id === cvId })));
      toast.success(t("cvSetDefaultSuccess"));
    } catch {
      toast.error(t("cvSetDefaultError"));
    }
  }

  async function handleDelete(cvId: string) {
    try {
      const res = await fetch(`/api/v1/seekers/me/cvs/${cvId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error(t("cvDeleteError"));
        return;
      }
      const deleted = cvs.find((cv) => cv.id === cvId);
      const remaining = cvs.filter((cv) => cv.id !== cvId);
      // If deleted was default and there are remaining CVs, promote the first one
      if (deleted?.isDefault && remaining.length > 0) {
        const [first, ...rest] = remaining;
        setCvs([{ ...first!, isDefault: true }, ...rest]);
      } else {
        setCvs(remaining);
      }
      toast.success(t("cvDeleteSuccess"));
    } catch {
      toast.error(t("cvDeleteError"));
    }
  }

  return (
    <section aria-label={t("cvTitle")}>
      <h2 className="text-lg font-semibold mb-4">{t("cvTitle")}</h2>

      <p className="text-sm text-muted-foreground mb-4">{t("cvHelp")}</p>

      {cvs.length === 0 && <p className="text-sm text-muted-foreground mb-4">{t("cvEmpty")}</p>}

      <ul className="space-y-3 mb-4">
        {cvs.map((cv) => (
          <li key={cv.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{cv.label}</span>
                {cv.isDefault && (
                  <Badge variant="default" data-testid="default-badge">
                    {t("cvDefault")}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">{cv.file.originalFilename}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              {!cv.isDefault && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleSetDefault(cv.id)}
                >
                  {t("cvSetDefault")}
                </Button>
              )}
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(cv.id)}
                aria-label={`${t("cvDelete")} ${cv.label}`}
              >
                {t("cvDelete")}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {atLimit ? (
        <p className="text-sm text-muted-foreground">{t("cvLimitReached")}</p>
      ) : (
        <div className="space-y-2">
          <div>
            <Label htmlFor="cv-label">{t("cvLabelLabel")}</Label>
            <Input
              id="cv-label"
              value={uploadLabel}
              onChange={(e) => setUploadLabel(e.target.value)}
              placeholder={t("cvLabelPlaceholder")}
              className="mt-1"
            />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            aria-hidden="true"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <Button
            type="button"
            variant="outline"
            disabled={uploading || !uploadLabel.trim()}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? t("cvUploading") : t("cvUpload")}
          </Button>
        </div>
      )}
    </section>
  );
}
