import { getTranslations } from "next-intl/server";
import { auth } from "@igbo/auth";
import { redirect } from "next/navigation";
import { getApplicationDetailForSeeker } from "@igbo/db/queries/portal-applications";
import { getTransitionHistory } from "@igbo/db/queries/portal-applications";
import { getConversationStatus } from "@/services/conversation-service";
import { ApplicationStatusBadge } from "@/components/domain/application-status-badge";
import { ApplicationTimeline } from "@/components/domain/application-timeline";
import { WithdrawApplicationControls } from "@/components/domain/withdraw-application-controls";
import { ApplicationMessagingSection } from "@/components/domain/application-messaging-section";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface PageProps {
  params: Promise<{ locale: string; applicationId: string }>;
}

export default async function ApplicationDetailPage({ params }: PageProps) {
  const { locale, applicationId } = await params;
  const t = await getTranslations("Portal.applications");

  const session = await auth();
  if (!session?.user || session.user.activePortalRole !== "JOB_SEEKER") {
    redirect(`/${locale}`);
  }

  const application = await getApplicationDetailForSeeker(applicationId, session.user.id);
  if (!application) {
    redirect(`/${locale}/applications`);
  }

  const transitions = await getTransitionHistory(applicationId);

  // Fetch conversation status for messaging section (SSR — initial hydration only)
  // Fail-closed: default readOnly=true so transient errors don't grant write access
  const convStatus = await getConversationStatus(applicationId, session.user.id).catch(() => ({
    exists: false,
    readOnly: true,
    unreadCount: 0,
    jobTitle: "",
    companyName: "",
    otherPartyName: "",
  }));

  const portfolioLinks = Array.isArray(application.portfolioLinksJson)
    ? application.portfolioLinksJson
    : [];

  // TODO(PREP-A): Replace with APPLICATION_TERMINAL_STATES from @igbo/db when PR #26 merges
  const APPLICATION_TERMINAL_STATES = ["hired", "rejected", "withdrawn"] as const;
  const isWithdrawable = !APPLICATION_TERMINAL_STATES.includes(
    application.status as (typeof APPLICATION_TERMINAL_STATES)[number],
  );

  return (
    <div className="py-8">
      {/* Back link */}
      <Link
        href="/applications"
        aria-label={t("backToList")}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        ← {t("backToList")}
      </Link>

      <h1 className="mb-2 text-2xl font-bold">{t("detailTitle")}</h1>

      {/* Header: job title + company + status */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-lg font-semibold">
            <Link href={`/jobs/${application.jobId}`} className="hover:underline">
              {application.jobTitle ?? "—"}
            </Link>
          </p>
          <p className="text-sm text-muted-foreground">{application.companyName ?? "—"}</p>
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
              {t("currentStatus")}
            </p>
            <ApplicationStatusBadge status={application.status} />
          </div>
          {isWithdrawable && (
            <WithdrawApplicationControls
              applicationId={application.id}
              jobTitle={application.jobTitle ?? ""}
              currentStatus={application.status}
            />
          )}
          <ApplicationMessagingSection
            applicationId={application.id}
            conversationExists={convStatus.exists}
            readOnly={convStatus.readOnly}
            otherPartyName={application.companyName || t("unknownCompany")}
            unreadCount={convStatus.unreadCount}
          />
        </div>
      </div>

      <Separator className="mb-6" />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: submission metadata */}
        <div className="space-y-4">
          {/* Cover letter */}
          <Card className="p-4">
            <h2 className="mb-2 text-sm font-semibold">{t("coverLetterHeading")}</h2>
            {application.coverLetterText ? (
              <pre className="whitespace-pre-wrap text-sm text-foreground">
                {application.coverLetterText}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noCoverLetter")}</p>
            )}
          </Card>

          {/* Selected CV */}
          {application.selectedCvId && (
            <Card className="p-4">
              <h2 className="mb-2 text-sm font-semibold">{t("selectedCvHeading")}</h2>
              <p className="text-sm text-foreground">
                {application.cvLabel ?? application.selectedCvId}
              </p>
            </Card>
          )}

          {/* Portfolio links */}
          {portfolioLinks.length > 0 && (
            <Card className="p-4">
              <h2 className="mb-2 text-sm font-semibold">{t("portfolioHeading")}</h2>
              <ul className="space-y-1">
                {portfolioLinks.map((link) => (
                  <li key={link}>
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* Right: timeline */}
        <div>
          <h2 className="mb-4 text-sm font-semibold">{t("timelineTitle")}</h2>
          {transitions.length > 0 ? (
            <ApplicationTimeline transitions={transitions} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("timelineSubmitted")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
