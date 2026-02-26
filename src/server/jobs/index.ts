export {
  registerJob,
  runJob,
  runAllDueJobs,
  getRegisteredJobs,
  clearRegistry,
  setErrorReporter,
} from "./job-runner";
export type { JobHandler, JobOptions } from "./job-runner";

// Register background jobs by importing them (side-effect: registerJob runs)
import "./retention-cleanup";
import "./data-export";
import "./file-processing";

// Register event-driven subscribers
// TODO: Epic 9 (Story 9.2) — move subscriber registration to a proper server initialization module for the web container
import { registerOnboardingCompletionSubscriber } from "@/services/onboarding-service";
registerOnboardingCompletionSubscriber();
