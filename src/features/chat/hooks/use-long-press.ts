"use client";

import { useCallback, useRef, useEffect } from "react";

interface UseLongPressOptions {
  onLongPress: () => void;
  delay?: number; // ms, default 500
}

/**
 * useLongPress — detect long-press on mobile.
 * Uses touchstart + setTimeout; clears on touchend/touchmove.
 * Does NOT rely on onContextMenu alone (inconsistent on Android/iOS).
 */
export function useLongPress({ onLongPress, delay = 500 }: UseLongPressOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback(() => {
    timerRef.current = setTimeout(() => {
      onLongPress();
    }, delay);
  }, [onLongPress, delay]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Clear timer on unmount to prevent firing on unmounted component
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    onTouchStart: start,
    onTouchEnd: cancel,
    onTouchMove: cancel,
  };
}
