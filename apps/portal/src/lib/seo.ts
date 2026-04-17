import type { Metadata } from "next";
import { stripHtmlTags, truncateText } from "./strip-html-tags";

// ---------------------------------------------------------------------------
// Shared plain-text extraction — call once, pass result to builders
// ---------------------------------------------------------------------------

/**
 * Extracts plain text from HTML and returns both full (for JSON-LD, max 5000)
 * and short (for OG/Twitter, max 200) versions. Avoids re-processing the
 * same HTML multiple times per request.
 */
export function extractPlainTexts(descriptionHtml: string | null): {
  full: string;
  short: string;
} {
  const plain = stripHtmlTags(descriptionHtml ?? "");
  return {
    full: truncateText(plain, 5000),
    short: truncateText(plain, 200),
  };
}

// ---------------------------------------------------------------------------
// Employment type mapping — Portal enum → Schema.org value
// ---------------------------------------------------------------------------

const EMPLOYMENT_TYPE_MAP: Record<string, string> = {
  full_time: "FULL_TIME",
  part_time: "PART_TIME",
  contract: "CONTRACTOR",
  internship: "INTERN",
  apprenticeship: "OTHER",
};

// ---------------------------------------------------------------------------
// Minimal types — we use the field shapes we need rather than full Drizzle types
// ---------------------------------------------------------------------------

interface PostingForSeo {
  id: string;
  title: string;
  descriptionHtml: string | null;
  location: string | null;
  employmentType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCompetitiveOnly: boolean;
  applicationDeadline: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

interface CompanyForSeo {
  id: string;
  name: string;
  logoUrl: string | null;
}

// ---------------------------------------------------------------------------
// JSON-LD JobPosting builder (AC #1)
// ---------------------------------------------------------------------------

/**
 * Builds a Schema.org JobPosting JSON-LD object for a job detail page.
 *
 * Only includes optional fields when data is present:
 * - baseSalary: only when salary is disclosed (not salaryCompetitiveOnly)
 * - validThrough: earlier of applicationDeadline vs expiresAt (omitted if neither)
 * - jobLocation: omitted if location is null
 * - baseSalary.value.minValue/maxValue: only the values that exist
 */
export function buildJobPostingJsonLd(
  posting: PostingForSeo,
  company: CompanyForSeo,
  portalUrl: string,
  plainDescription?: string,
): Record<string, unknown> {
  const description =
    plainDescription ?? truncateText(stripHtmlTags(posting.descriptionHtml ?? ""), 5000);

  // validThrough: pick the earlier of applicationDeadline and expiresAt
  let validThrough: string | undefined;
  const deadline = posting.applicationDeadline;
  const expiresAt = posting.expiresAt;
  if (deadline && expiresAt) {
    validThrough = (deadline < expiresAt ? deadline : expiresAt).toISOString();
  } else if (deadline) {
    validThrough = deadline.toISOString();
  } else if (expiresAt) {
    validThrough = expiresAt.toISOString();
  }

  // baseSalary: only when salary is explicitly set (not competitive-only)
  let baseSalary: Record<string, unknown> | undefined;
  if (
    !posting.salaryCompetitiveOnly &&
    (posting.salaryMin !== null || posting.salaryMax !== null)
  ) {
    const value: Record<string, unknown> = {
      "@type": "QuantitativeValue",
      unitText: "YEAR",
    };
    if (posting.salaryMin !== null) value.minValue = posting.salaryMin;
    if (posting.salaryMax !== null) value.maxValue = posting.salaryMax;
    baseSalary = {
      "@type": "MonetaryAmount",
      currency: "NGN",
      value,
    };
  }

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: posting.title,
    description,
    datePosted: posting.createdAt.toISOString().slice(0, 10),
    employmentType: EMPLOYMENT_TYPE_MAP[posting.employmentType] ?? "OTHER",
    hiringOrganization: {
      "@type": "Organization",
      name: company.name,
      ...(company.logoUrl ? { logo: company.logoUrl } : {}),
      sameAs: `${portalUrl}/en/companies/${company.id}`,
    },
    identifier: {
      "@type": "PropertyValue",
      name: "OBIGBO",
      value: posting.id,
    },
  };

  if (posting.location) {
    jsonLd.jobLocation = {
      "@type": "Place",
      address: posting.location,
    };
  }

  if (validThrough) {
    jsonLd.validThrough = validThrough;
  }

  if (baseSalary) {
    jsonLd.baseSalary = baseSalary;
  }

  return jsonLd;
}

// ---------------------------------------------------------------------------
// Open Graph builder (AC #2)
// ---------------------------------------------------------------------------

/**
 * Builds Next.js Metadata openGraph object for a job detail page.
 */
export function buildJobOpenGraph(
  posting: PostingForSeo,
  company: CompanyForSeo,
  portalUrl: string,
  locale: string,
  plainDescription?: string,
): Metadata["openGraph"] {
  const desc = plainDescription ?? truncateText(stripHtmlTags(posting.descriptionHtml ?? ""), 200);
  const canonicalUrl = `${portalUrl}/en/jobs/${posting.id}`;
  const imageUrl = company.logoUrl ?? (portalUrl ? `${portalUrl}/og-default.png` : null);

  return {
    title: `${posting.title} at ${company.name}`,
    description: desc,
    url: canonicalUrl,
    type: "website",
    siteName: "OBIGBO Job Portal",
    ...(imageUrl
      ? {
          images: [
            {
              url: imageUrl,
              width: 1200,
              height: 630,
              alt: `${company.name} - ${posting.title}`,
            },
          ],
        }
      : {}),
    locale,
  };
}

// ---------------------------------------------------------------------------
// Twitter Card builder (AC #2)
// ---------------------------------------------------------------------------

/**
 * Builds Next.js Metadata twitter object for a job detail page.
 */
export function buildJobTwitterCard(
  posting: PostingForSeo,
  company: CompanyForSeo,
  portalUrl: string,
  plainDescription?: string,
): Metadata["twitter"] {
  const desc = plainDescription ?? truncateText(stripHtmlTags(posting.descriptionHtml ?? ""), 200);
  const imageUrl = company.logoUrl ?? (portalUrl ? `${portalUrl}/og-default.png` : null);

  return {
    card: "summary",
    title: `${posting.title} at ${company.name}`,
    description: desc,
    ...(imageUrl ? { images: [imageUrl] } : {}),
  };
}
