import "./index"; // registers all jobs (side effects from future story additions)
import { runJob, runAllDueJobs, getRegisteredJobs } from "./job-runner";

const log = (data: Record<string, unknown>) => console.info(JSON.stringify(data));

let shutdownRequested = false;
let shutdownExitCode = 0;

process.on("SIGINT", () => {
  log({ level: "info", message: "run-jobs.interrupted", timestamp: new Date().toISOString() });
  shutdownRequested = true;
  shutdownExitCode = 130;
});

process.on("SIGTERM", () => {
  log({ level: "info", message: "run-jobs.terminated", timestamp: new Date().toISOString() });
  shutdownRequested = true;
  shutdownExitCode = 143;
});

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const jobName = args[0];

  if (!jobName) {
    log({
      level: "error",
      message: "Usage: run-jobs.ts <job-name> | --all",
      timestamp: new Date().toISOString(),
    });
    process.exit(1);
  }

  let success: boolean;

  if (jobName === "--all") {
    const jobs = getRegisteredJobs();
    log({
      level: "info",
      message: "run-jobs.start-all",
      jobCount: jobs.length,
      jobs,
      timestamp: new Date().toISOString(),
    });
    success = await runAllDueJobs();
  } else {
    success = await runJob(jobName);
  }

  // Respect any signal received during job execution — exit with signal code
  process.exit(shutdownRequested ? shutdownExitCode : success ? 0 : 1);
}

main().catch((err) => {
  log({
    level: "error",
    message: "run-jobs.fatal",
    error: (err as Error).message,
    timestamp: new Date().toISOString(),
  });
  process.exit(1);
});
