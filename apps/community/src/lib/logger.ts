import { getRequestContext } from "@/lib/request-context";

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  error?: unknown;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  traceId: string | undefined;
  message: string;
  context?: string;
  error?: { message: string; stack?: string; name: string };
  [key: string]: unknown;
}

function serializeError(err: unknown): { message: string; stack?: string; name: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack, name: err.name };
  }
  return { message: String(err), name: "UnknownError" };
}

function buildEntry(
  level: LogLevel,
  message: string,
  contextName?: string,
  extra?: LogContext,
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    traceId: getRequestContext()?.traceId,
    message,
    context: contextName,
  };

  if (extra) {
    const { error, ...rest } = extra;
    if (error !== undefined) {
      entry.error = serializeError(error);
    }
    Object.assign(entry, rest);
  }

  return entry;
}

function isDebugEnabled(): boolean {
  if (process.env.LOG_LEVEL === "debug") return true; // ci-allow-process-env — shared with standalone realtime server
  if (process.env.NODE_ENV !== "production") return true;
  return false;
}

export interface Logger {
  info(message: string, extra?: LogContext): void;
  warn(message: string, extra?: LogContext): void;
  error(message: string, extra?: LogContext): void;
  debug(message: string, extra?: LogContext): void;
}

function makeLogger(contextName?: string): Logger {
  return {
    info(message, extra) {
      console.info(JSON.stringify(buildEntry("info", message, contextName, extra)));
    },
    warn(message, extra) {
      console.warn(JSON.stringify(buildEntry("warn", message, contextName, extra)));
    },
    error(message, extra) {
      console.error(JSON.stringify(buildEntry("error", message, contextName, extra)));
    },
    debug(message, extra) {
      if (!isDebugEnabled()) return;
      // eslint-disable-next-line no-console
      console.debug(JSON.stringify(buildEntry("debug", message, contextName, extra)));
    },
  };
}

/** Default logger (no context pre-set) */
export const logger: Logger = makeLogger();

/** Factory: creates a logger with `context` pre-set for the given module/service. */
export function createLogger(context: string): Logger {
  return makeLogger(context);
}
