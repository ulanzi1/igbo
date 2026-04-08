import * as React from "react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import type {
  PortalSeekerProfile,
  SeekerExperience,
  SeekerEducation,
} from "@igbo/db/schema/portal-seeker-profiles";

interface SeekerProfileViewProps {
  profile: PortalSeekerProfile;
  editable: boolean;
}

export async function SeekerProfileView({ profile, editable }: SeekerProfileViewProps) {
  const t = await getTranslations("Portal.seeker");

  const experience = (profile.experienceJson as SeekerExperience[]) ?? [];
  const education = (profile.educationJson as SeekerEducation[]) ?? [];

  return (
    <article>
      <h1 className="text-2xl font-bold">{profile.headline}</h1>

      {profile.summary && (
        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{profile.summary}</p>
      )}

      {editable && (
        <Link
          href={{ pathname: "/profile", query: { edit: "true" } }}
          className="mt-4 inline-flex items-center rounded-md border px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent"
        >
          {t("edit")}
        </Link>
      )}

      {/* Skills */}
      <section className="mt-6" aria-labelledby="skills-heading">
        <h2 id="skills-heading" className="mb-2 font-semibold">
          {t("skillsSection")}
        </h2>
        {profile.skills && profile.skills.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {profile.skills.map((skill, i) => (
              <Badge key={i} variant="secondary">
                {skill}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("skillsEmpty")}</p>
        )}
      </section>

      {/* Experience */}
      <section className="mt-6" aria-labelledby="experience-heading">
        <h2 id="experience-heading" className="mb-2 font-semibold">
          {t("experienceSection")}
        </h2>
        {experience.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {experience.map((entry, i) => (
              <li key={i} className="rounded-md border p-3">
                <p className="font-medium">
                  {entry.title} &bull; {entry.company}
                </p>
                <p className="text-sm text-muted-foreground">
                  {entry.startDate} – {entry.endDate}
                </p>
                {entry.description && (
                  <p className="mt-1 whitespace-pre-wrap text-sm">{entry.description}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("experienceEmpty")}</p>
        )}
      </section>

      {/* Education */}
      <section className="mt-6" aria-labelledby="education-heading">
        <h2 id="education-heading" className="mb-2 font-semibold">
          {t("educationSection")}
        </h2>
        {education.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {education.map((entry, i) => (
              <li key={i} className="rounded-md border p-3">
                <p className="font-medium">{entry.institution}</p>
                <p className="text-sm">
                  {t("educationInField", { degree: entry.degree, field: entry.field })} &bull;{" "}
                  {entry.graduationYear}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("educationEmpty")}</p>
        )}
      </section>
    </article>
  );
}
