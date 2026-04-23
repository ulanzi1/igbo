"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

// Add "/obigbo-slider11.<ext>" here when the 11th banner is ready
const SLIDES = [
  "/obigbo-slider1.jpg",
  "/obigbo-slider2.jpg",
  "/obigbo-slider3.jpg",
  "/obigbo-slider4.jpg",
  "/obigbo-slider5.jpg",
  "/obigbo-slider6.jpeg",
  "/obigbo-slider7.jpg",
  "/obigbo-slider8.jpg",
  "/obigbo-slider9.jpg",
  "/obigbo-slider10.jpeg",
];

const INTERVAL_MS = 8000;

export function BannerSlider() {
  const t = useTranslations("Splash");
  const [current, setCurrent] = useState(0);
  // Seed with slides 0 + 1 so the second slide is ready before the first transition
  const [loaded, setLoaded] = useState<Set<number>>(new Set([0, 1]));

  useEffect(() => {
    const id = setInterval(() => {
      // Advance current and preload lookahead — both updates stay inside the
      // interval callback so no setState fires synchronously in the effect body.
      setCurrent((prev) => {
        const next = (prev + 1) % SLIDES.length;
        const lookahead = (next + 1) % SLIDES.length;
        setLoaded((s) => {
          if (s.has(next) && s.has(lookahead)) return s;
          return new Set([...s, next, lookahead]);
        });
        return next;
      });
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [current]); // current in deps resets the 8 s countdown on manual navigation

  const goTo = (idx: number) => {
    const lookahead = (idx + 1) % SLIDES.length;
    setLoaded((s) => {
      if (s.has(idx) && s.has(lookahead)) return s;
      return new Set([...s, idx, lookahead]);
    });
    setCurrent(idx);
  };

  return (
    <section aria-label={t("sliderAriaLabel")} className="relative w-full overflow-hidden">
      {/* aspect-[4/3] on mobile, wide panoramic on md+ */}
      <div className="relative aspect-[4/3] md:aspect-[21/7] w-full bg-muted">
        {SLIDES.map((src, i) => (
          <div
            key={src}
            className={`absolute inset-0 transition-opacity duration-700 ${
              i === current ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            aria-hidden={i !== current}
          >
            {loaded.has(i) && (
              <Image
                src={src}
                alt={t("sliderBannerAlt", { index: i + 1 })}
                fill
                className="object-cover"
                priority={i === 0}
                sizes="100vw"
              />
            )}
          </div>
        ))}
      </div>

      {/* Dot navigation */}
      <div
        className="absolute bottom-3 left-0 right-0 flex justify-center gap-2"
        role="tablist"
        aria-label={t("sliderDotsAriaLabel")}
      >
        {SLIDES.map((_, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={i === current}
            aria-label={`Go to slide ${i + 1}`}
            onClick={() => goTo(i)}
            className={`h-2 rounded-full transition-all duration-300 ${
              i === current ? "w-6 bg-white shadow" : "w-2 bg-white/50 hover:bg-white/80"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
