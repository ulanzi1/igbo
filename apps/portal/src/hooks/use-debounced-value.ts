"use client";

import { useState, useEffect } from "react";

/**
 * Returns a debounced version of `value` that only updates after `ms` milliseconds
 * of inactivity. The timeout is cleared on unmount and whenever `value` or `ms` changes.
 *
 * Usage: debounce the search query input so URL updates (and thus API fetches)
 * don't fire on every keystroke.
 *
 * @param value - The value to debounce.
 * @param ms    - Debounce delay in milliseconds (default: 300).
 */
export function useDebouncedValue<T>(value: T, ms = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, ms);

    return () => {
      clearTimeout(timer);
    };
  }, [value, ms]);

  return debouncedValue;
}
