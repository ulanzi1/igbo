/**
 * Branded maintenance page — shown during scheduled maintenance.
 * CRITICAL: NO imports from @/lib/auth, @/db, or any server-side service.
 * Minimal deps to ensure page renders even when the DB is unavailable.
 * i18n strings hardcoded (next-intl provider may not be available during maintenance).
 * HTTP 503 is set via middleware redirect; this page just displays content.
 */

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

export default async function MaintenancePage({ params }: MaintenancePageProps) {
  const { locale } = await params;
  const t = locale === "ig" ? strings.ig : strings.en;

  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{t.title} — OBIGBO</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f9fafb;
            color: #111827;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 2rem;
          }
          .container {
            max-width: 480px;
            width: 100%;
            text-align: center;
          }
          .logo-wrap {
            margin-bottom: 2rem;
          }
          h1 {
            font-size: 1.5rem;
            font-weight: 700;
            margin-bottom: 1rem;
            color: #111827;
          }
          p {
            font-size: 1rem;
            color: #6b7280;
            line-height: 1.6;
            margin-bottom: 0.75rem;
          }
          .badge {
            display: inline-block;
            background: #fef3c7;
            color: #92400e;
            border: 1px solid #fcd34d;
            border-radius: 9999px;
            padding: 0.25rem 0.875rem;
            font-size: 0.875rem;
            font-weight: 500;
            margin-bottom: 1.5rem;
          }
        `}</style>
      </head>
      <body>
        <div className="container">
          <div className="logo-wrap">
            {/* OBIGBO logo — inline SVG, no external assets */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 80 80"
              width="64"
              height="64"
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
          <span className="badge">Maintenance</span>
          <h1>{t.title}</h1>
          <p>{t.message}</p>
          <p>{t.apology}</p>
          <p>{t.expectedReturn}</p>
        </div>
      </body>
    </html>
  );
}
