// NOTE: No "server-only" import — this runs as standalone Node.js, not inside Next.js
// NOTE: No "@/" imports — this module must work in esbuild-bundled realtime server
// Standalone logger that mirrors the JSON format from src/lib/logger.ts

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  error?: unknown;
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
): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
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
  if (process.env.LOG_LEVEL === "debug") return true;
  if (process.env.NODE_ENV !== "production") return true;
  return false;
}

export interface RealtimeLogger {
  info(message: string, extra?: LogContext): void;
  warn(message: string, extra?: LogContext): void;
  error(message: string, extra?: LogContext): void;
  debug(message: string, extra?: LogContext): void;
}

function makeLogger(contextName?: string): RealtimeLogger {
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

export function createRealtimeLogger(context: string): RealtimeLogger {
  return makeLogger(context);
}

export const realtimeLogger: RealtimeLogger = makeLogger("realtime");
