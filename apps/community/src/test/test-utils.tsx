/**
 * React render helpers for tests.
 * For vi.mock() factories (socket context, EventBus handler capture, React Query timers),
 * see `vi-patterns.ts` in this directory.
 */
import { render, type RenderOptions } from "@testing-library/react";
import { type ReactElement } from "react";

function AllProviders({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function customRender(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, { wrapper: AllProviders, ...options });
}

export * from "@testing-library/react";
export { customRender as render };
