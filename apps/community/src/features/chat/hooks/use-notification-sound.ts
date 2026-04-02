"use client";

import { useCallback, useRef } from "react";

/**
 * useNotificationSound — plays a short synthetic two-tone chime
 * using the Web Audio API. Lazy-inits AudioContext on first call
 * (browsers require a user gesture before audio can play).
 */
export function useNotificationSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  const playChime = useCallback(() => {
    try {
      if (!ctxRef.current) {
        ctxRef.current = new AudioContext();
      }
      const ctx = ctxRef.current;

      // Resume if suspended (autoplay policy)
      if (ctx.state === "suspended") {
        void ctx.resume();
      }

      const now = ctx.currentTime;

      // Tone 1: 587 Hz for 80ms
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.frequency.value = 587;
      osc1.type = "sine";
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.08);

      // Tone 2: 880 Hz for 100ms, starts after tone 1
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.frequency.value = 880;
      osc2.type = "sine";
      gain2.gain.setValueAtTime(0.15, now + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.08);
      osc2.stop(now + 0.18);
    } catch {
      // Silently ignore — audio is non-critical
    }
  }, []);

  return { playChime };
}
