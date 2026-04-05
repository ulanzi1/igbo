"use client";

import * as React from "react";

export type DensityLevel = "comfortable" | "compact" | "dense";

export const DENSITY_STYLES = {
  comfortable: "py-4 px-4 text-base",
  compact: "py-3 px-3 text-sm",
  dense: "py-2 px-2 text-sm",
} as const;

export const ROLE_DENSITY_DEFAULTS: Record<string, DensityLevel> = {
  JOB_SEEKER: "comfortable",
  EMPLOYER: "compact",
  JOB_ADMIN: "dense",
};

interface DensityContextValue {
  density: DensityLevel;
  setDensity: (level: DensityLevel) => void;
}

const DensityContext = React.createContext<DensityContextValue | null>(null);

interface DensityProviderProps {
  children: React.ReactNode;
  defaultDensity: DensityLevel;
}

export function DensityProvider({ children, defaultDensity }: DensityProviderProps) {
  const [density, setDensityState] = React.useState<DensityLevel>(defaultDensity);

  // Read localStorage override after hydration to avoid SSR mismatch.
  // useState initializer runs on the server where window is undefined;
  // React reuses server state during hydration, so reading localStorage
  // in the initializer would be silently ignored. useEffect runs only
  // on the client after mount, guaranteeing the stored preference is applied.
  React.useEffect(() => {
    const stored = window.localStorage.getItem("portal-density") as DensityLevel | null;
    if (stored && (stored === "comfortable" || stored === "compact" || stored === "dense")) {
      setDensityState(stored);
    }
  }, []);

  function setDensity(level: DensityLevel) {
    setDensityState(level);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("portal-density", level);
    }
  }

  return (
    <DensityContext.Provider value={{ density, setDensity }}>{children}</DensityContext.Provider>
  );
}

export function useDensity(): DensityContextValue {
  const ctx = React.useContext(DensityContext);
  if (!ctx) {
    throw new Error("useDensity must be used within a DensityProvider");
  }
  return ctx;
}
