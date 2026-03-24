import "./index"; // registers all jobs (side effects from future story additions)
import { runJob, runAllDueJobs, getRegisteredJobs } from "./job-runner";
import { createLogger } from "@/lib/logger";

const log = createLogger("run-jobs");

let shutdownRequested = false;
let shutdownExitCode = 0;

process.on("SIGINT", () => {
  log.info("run-jobs.interrupted");
  shutdownRequested = true;
  shutdownExitCode = 130;
});

process.on("SIGTERM", () => {
  log.info("run-jobs.terminated");
  shutdownRequested = true;
  shutdownExitCode = 143;
});

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const jobName = args[0];

  if (!jobName) {
    log.error("Usage: run-jobs.ts <job-name> | --all");
    process.exit(1);
  }

  let success: boolean;

  if (jobName === "--all") {
    const jobs = getRegisteredJobs();
    log.info("run-jobs.start-all", { jobCount: jobs.length, jobs });
    success = await runAllDueJobs();
  } else {
    success = await runJob(jobName);
  }

  // Respect any signal received during job execution — exit with signal code
  process.exit(shutdownRequested ? shutdownExitCode : success ? 0 : 1);
}

main().catch((err) => {
  log.error("run-jobs.fatal", { error: err });
  process.exit(1);
});
