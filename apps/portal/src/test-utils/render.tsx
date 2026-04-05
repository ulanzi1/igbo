import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import { SessionProvider } from "next-auth/react";
import { NextIntlClientProvider } from "next-intl";
import type { Session } from "next-auth";
import enMessages from "../../messages/en.json";
import { DensityProvider, type DensityLevel } from "@/providers/density-context";

interface RenderOptions {
  session?: Session | null;
  locale?: string;
  density?: DensityLevel;
}

function renderWithPortalProviders(ui: React.ReactElement, options: RenderOptions = {}) {
  const { session = null, locale = "en", density = "comfortable" } = options;

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <SessionProvider session={session}>
        <DensityProvider defaultDensity={density}>
          <NextIntlClientProvider locale={locale} messages={enMessages}>
            {children}
          </NextIntlClientProvider>
        </DensityProvider>
      </SessionProvider>
    );
  }

  return render(ui, { wrapper: Wrapper });
}

export { renderWithPortalProviders, screen, waitFor, within };
