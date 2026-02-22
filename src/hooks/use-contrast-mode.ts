"use client";

import { useState, useEffect, useCallback } from "react";

type ContrastMode = "default" | "high";

const STORAGE_KEY = "igbo-contrast-mode";
const HTML_ATTRIBUTE = "data-contrast";

function useContrastMode() {
  const [mode, setMode] = useState<ContrastMode>(() => {
    // SSR safety: localStorage is undefined on the server
    if (typeof window === "undefined") return "default";
    return (localStorage.getItem(STORAGE_KEY) as ContrastMode) ?? "default";
  });

  // Apply the data-contrast attribute on <html> whenever mode changes
  useEffect(() => {
    const html = document.documentElement;
    if (mode === "high") {
      html.setAttribute(HTML_ATTRIBUTE, "high");
    } else {
      html.removeAttribute(HTML_ATTRIBUTE);
    }
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const toggle = useCallback(() => {
    setMode((prev) => (prev === "high" ? "default" : "high"));
  }, []);

  const setContrastMode = useCallback((newMode: ContrastMode) => {
    setMode(newMode);
  }, []);

  return { mode, toggle, setContrastMode, isHighContrast: mode === "high" };
}

export { useContrastMode, STORAGE_KEY };
export type { ContrastMode };
