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
import "./recording-mirror";
import "./recording-cleanup";
import "./event-reminders";
import "./notification-digest";

// Register event-driven subscribers
// TODO: Epic 9 (Story 9.2) — move subscriber registration to a proper server initialization module for the web container
import { registerOnboardingCompletionSubscriber } from "@/services/onboarding-service";
registerOnboardingCompletionSubscriber();

// Side-effect import: registers all eventBus.on() handlers for notifications + emails
// (article.submitted, article.published, article.rejected, article.revision_requested,
//  member.approved, message.mentioned, group events, account.status_changed)
import "@/services/notification-service";

// Side-effect import: registers all eventBus.on() handlers for points engine
// (post.reacted, event.attended, article.published, account.status_changed)
import "@/services/points-engine";
