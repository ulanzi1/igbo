import "server-only";
import type { ScreeningFlag, ScreeningResult } from "@igbo/db/schema/portal-job-postings";

export type { ScreeningFlag, ScreeningResult };

export type ScreeningInput = {
  title: string | null;
  descriptionHtml: string | null;
  descriptionIgboHtml: string | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCompetitiveOnly: boolean;
};

export type ScreeningContext = {
  blocklistPhrases: string[];
};
