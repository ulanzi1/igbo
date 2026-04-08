import "server-only";
import type { ScreeningFlag, ScreeningInput, ScreeningContext } from "./types";
import { requiredFieldsRule } from "./rules/required-fields.rule";
import { blocklistRule } from "./rules/blocklist.rule";
import { salarySanityRule } from "./rules/salary-sanity.rule";
import { descriptionQualityRule } from "./rules/description-quality.rule";
import { contactInfoLeakRule } from "./rules/contact-info-leak.rule";

export type RuleEntry = {
  id: string;
  version: number;
  run: (
    input: ScreeningInput,
    ctx?: ScreeningContext,
  ) => ScreeningFlag[] | Promise<ScreeningFlag[]>;
};

export const RULES: ReadonlyArray<RuleEntry> = [
  {
    id: "required_fields",
    version: 1,
    run: (input) => requiredFieldsRule(input),
  },
  {
    id: "blocklist",
    version: 1,
    run: (input, ctx) => blocklistRule(input, ctx),
  },
  {
    id: "salary_sanity",
    version: 1,
    run: (input) => salarySanityRule(input),
  },
  {
    id: "description_quality",
    version: 1,
    run: (input) => descriptionQualityRule(input),
  },
  {
    id: "contact_info_leak",
    version: 1,
    run: (input) => contactInfoLeakRule(input),
  },
];
