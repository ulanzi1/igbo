import "server-only";

/** Absolute lower bound for salary in NGN. Values below this are high-severity fail. */
export const SALARY_MIN_BOUND = 50_000;

/** Absolute upper bound for salary in NGN. Values above this are high-severity fail. */
export const SALARY_MAX_BOUND = 50_000_000;

/** Outlier low threshold — salary >= SALARY_MIN_BOUND but < this produces a medium warning. */
export const SALARY_OUTLIER_LOW = 100_000;

/** Outlier high threshold — salary > this but <= SALARY_MAX_BOUND produces a medium warning. */
export const SALARY_OUTLIER_HIGH = 20_000_000;
