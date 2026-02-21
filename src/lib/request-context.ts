import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  traceId: string;
  userId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}

export function runWithContext<T>(
  context: RequestContext,
  fn: () => T,
): T {
  return requestContext.run(context, fn);
}
