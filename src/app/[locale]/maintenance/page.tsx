/**
 * Branded maintenance page — shown during scheduled maintenance.
 * CRITICAL: NO imports from @/lib/auth, @/db, or any server-side service.
 * Minimal deps to ensure page renders even when the DB is unavailable.
 * i18n strings hardcoded (next-intl provider may not be available during maintenance).
 * HTTP 503 is set via middleware redirect; this page just displays content.
 *
 * NOTE: Renders as a standard page component within the Next.js layout.
 * No nested document tags — those come from the root layout.
 */

import type { Metadata } from "next";

interface MaintenancePageProps {
  params: Promise<{ locale: string }>;
}

// English and Igbo strings hardcoded — next-intl provider unavailable during maintenance
const strings = {
  en: {
    title: "Scheduled Maintenance",
    message: "The OBIGBO Community Platform is temporarily offline for maintenance.",
    apology: "We apologize for the inconvenience. Please check back soon.",
    expectedReturn: "We are working to restore service as quickly as possible.",
  },
  ig: {
    title: "Nhazigharị Oge Ndị Nna",
    message: "Ikpo okwu OBIGBO dị na mbara oge maka nhazigharị.",
    apology: "Anyị arịọ mgbaghara maka nsogbu a. Biko lọghachie n'oge ọzọ.",
    expectedReturn: "Anyị na-arụ ọrụ iji weghachite ọrụ n'oge ọ na-efu.",
  },
};

export const metadata: Metadata = {
  title: "Scheduled Maintenance — OBIGBO",
};

export default async function MaintenancePage({ params }: MaintenancePageProps) {
  const { locale } = await params;
  const t = locale === "ig" ? strings.ig : strings.en;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        background: "#f9fafb",
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
        <div style={{ marginBottom: "2rem" }}>
          {/* OBIGBO logo — inline SVG, no external assets */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 80 80"
            width={64}
            height={64}
            aria-label="OBIGBO logo"
            role="img"
          >
            <circle cx="40" cy="40" r="38" fill="#22c55e" />
            <text
              x="40"
              y="52"
              textAnchor="middle"
              fontFamily="-apple-system, sans-serif"
              fontWeight="bold"
              fontSize="28"
              fill="white"
            >
              OB
            </text>
          </svg>
        </div>
        <span
          style={{
            display: "inline-block",
            background: "#fef3c7",
            color: "#92400e",
            border: "1px solid #fcd34d",
            borderRadius: 9999,
            padding: "0.25rem 0.875rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            marginBottom: "1.5rem",
          }}
        >
          Maintenance
        </span>
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            marginBottom: "1rem",
            color: "#111827",
          }}
        >
          {t.title}
        </h1>
        <p style={{ fontSize: "1rem", color: "#6b7280", lineHeight: 1.6, marginBottom: "0.75rem" }}>
          {t.message}
        </p>
        <p style={{ fontSize: "1rem", color: "#6b7280", lineHeight: 1.6, marginBottom: "0.75rem" }}>
          {t.apology}
        </p>
        <p style={{ fontSize: "1rem", color: "#6b7280", lineHeight: 1.6, marginBottom: "0.75rem" }}>
          {t.expectedReturn}
        </p>
      </div>
    </div>
  );
}
