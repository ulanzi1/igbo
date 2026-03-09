import { getTranslations } from "next-intl/server";

interface Props {
  searchParams: Promise<{ until?: string; reason?: string }>;
}

export default async function SuspendedPage({ searchParams }: Props) {
  const t = await getTranslations("Auth.suspended");
  const params = await searchParams;
  const { until, reason } = params;

  const expiryDate = until ? new Date(until) : null;
  const isValidDate = expiryDate && !isNaN(expiryDate.getTime());

  // Sanitize and cap reason length to prevent abuse via crafted URLs
  const MAX_REASON_LENGTH = 500;
  const sanitizedReason = reason ? decodeURIComponent(reason).slice(0, MAX_REASON_LENGTH) : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="max-w-md w-full bg-zinc-900 border border-zinc-700 rounded-lg p-8 text-center">
        <div className="w-16 h-16 bg-orange-900/20 border border-orange-700 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-8 h-8 text-orange-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">{t("title")}</h1>
        <p className="text-zinc-400 mb-6">{t("description")}</p>

        {isValidDate && (
          <div className="bg-zinc-800 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-zinc-400 mb-1">{t("expiresLabel")}</p>
            <p className="text-white font-medium">
              {expiryDate.toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        )}

        {sanitizedReason && (
          <div className="bg-zinc-800 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-zinc-400 mb-1">{t("reasonLabel")}</p>
            <p className="text-white text-sm">{sanitizedReason}</p>
          </div>
        )}

        <a
          href="mailto:support@obigbo.com"
          className="inline-block bg-zinc-700 hover:bg-zinc-600 text-white px-6 py-2 rounded text-sm transition-colors"
        >
          {t("contactSupport")}
        </a>
      </div>
    </div>
  );
}
