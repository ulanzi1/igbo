"use client";
import { useState, useEffect } from "react";

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false); // default false (SSR safe)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing external media query
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}
