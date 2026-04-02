import "server-only";
import { randomUUID } from "node:crypto";
import { runWithContext } from "@/lib/request-context";
import { createLogger } from "@/lib/logger";
import { eventBus } from "@/services/event-bus";

const DEFAULT_RETRIES = 3;
const DEFAULT_BACKOFF_MS = 1000;

export type JobHandler = () => Promise<void>;

export interface JobOptions {
  retries?: number;
  backoffMs?: number;
  timeoutMs?: number;
}

interface RegisteredJob {
  name: string;
  handler: JobHandler;
  options: Required<Pick<JobOptions, "retries" | "backoffMs">> & { timeoutMs?: number };
}

type ErrorReporter = (error: Error, context: Record<string, unknown>) => void;

const log = createLogger("job-runner");

let errorReporter: ErrorReporter = (error, context) => {
  log.error("job.error_reporter", { error, ...context });
};

const registry = new Map<string, RegisteredJob>();

export function setErrorReporter(reporter: ErrorReporter): void {
  errorReporter = reporter;
}

export function registerJob(name: string, handler: JobHandler, options: JobOptions = {}): void {
  registry.set(name, {
    name,
    handler,
    options: {
      retries: options.retries ?? DEFAULT_RETRIES,
      backoffMs: options.backoffMs ?? DEFAULT_BACKOFF_MS,
      timeoutMs: options.timeoutMs,
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Job timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function runJob(name: string): Promise<boolean> {
  const job = registry.get(name);
  if (!job) {
    throw new Error(`Job "${name}" is not registered`);
  }

  const traceId = randomUUID();
  const startTime = Date.now();

  return runWithContext({ traceId }, async () => {
    log.info("job.start", { jobName: name, traceId });

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= job.options.retries + 1; attempt++) {
      try {
        const execution = job.handler();
        if (job.options.timeoutMs) {
          await withTimeout(execution, job.options.timeoutMs);
        } else {
          await execution;
        }

        const duration = Date.now() - startTime;
        log.info("job.complete", { jobName: name, traceId, duration });
        return true;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt <= job.options.retries) {
          const backoff = Math.pow(2, attempt - 1) * job.options.backoffMs;
          log.warn("job.retry", { jobName: name, traceId, attempt, backoffMs: backoff });
          await sleep(backoff);
        }
      }
    }

    const duration = Date.now() - startTime;
    const error = lastError!;

    log.error("job.failed", {
      jobName: name,
      traceId,
      duration,
      attempts: job.options.retries + 1,
      error,
    });

    errorReporter(error, { jobName: name, traceId, attempts: job.options.retries + 1 });

    eventBus.emit("job.failed", {
      jobName: name,
      error: error.message,
      attempts: job.options.retries + 1,
      timestamp: new Date().toISOString(),
    });

    return false;
  });
}

export async function runAllDueJobs(): Promise<boolean> {
  let allSucceeded = true;

  for (const [name] of registry) {
    const success = await runJob(name);
    if (!success) {
      allSucceeded = false;
    }
  }

  return allSucceeded;
}

export function getRegisteredJobs(): string[] {
  return Array.from(registry.keys());
}

export function clearRegistry(): void {
  registry.clear();
}
