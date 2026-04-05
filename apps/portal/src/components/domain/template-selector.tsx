"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { JOB_TEMPLATES } from "@/lib/job-templates";
import type { JobTemplate } from "@/lib/job-templates";

interface TemplateSelectorProps {
  onSelect: (template: JobTemplate) => void;
  disabled?: boolean;
}

export function TemplateSelector({ onSelect, disabled = false }: TemplateSelectorProps) {
  const t = useTranslations("Portal.templates");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSelect = (template: JobTemplate) => {
    onSelect(template);
    setOpen(false);
  };

  // Close on Escape key or outside click
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="use-template-button"
        className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
      >
        {t("useTemplate")}
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t("selectTemplate")}
          data-testid="template-dropdown"
          className="absolute left-0 top-full z-50 mt-1 w-72 rounded-md border border-border bg-popover py-1 shadow-md"
        >
          <li role="presentation" className="px-3 py-2 text-xs text-muted-foreground">
            {t("selectDescription")}
          </li>
          {JOB_TEMPLATES.map((template) => (
            <li key={template.id} role="option" aria-selected={false}>
              <button
                type="button"
                onClick={() => handleSelect(template)}
                data-testid={`template-option-${template.id}`}
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
              >
                {t(template.titleKey.replace("Portal.templates.", "") as Parameters<typeof t>[0])}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TemplateSelectorSkeleton() {
  return <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />;
}
