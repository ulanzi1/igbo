"use client";

/**
 * ConfirmationCheckmark — Google Pay-inspired animated SVG checkmark.
 * Uses CSS @keyframes for scale + fade-in motion (~600ms).
 * aria-hidden="true" — decorative; semantic meaning conveyed by sibling text.
 */
export function ConfirmationCheckmark() {
  return (
    <>
      <style>{`
        @keyframes checkmark-scale-in {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes checkmark-path-draw {
          0% { stroke-dashoffset: 50; }
          100% { stroke-dashoffset: 0; }
        }
        .checkmark-circle {
          animation: checkmark-scale-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .checkmark-path {
          stroke-dasharray: 50;
          stroke-dashoffset: 50;
          animation: checkmark-path-draw 0.3s ease-out 0.35s forwards;
        }
      `}</style>
      <svg
        aria-hidden="true"
        width="64"
        height="64"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="mx-auto"
        data-testid="confirmation-checkmark"
      >
        <circle className="checkmark-circle" cx="32" cy="32" r="30" fill="#22c55e" />
        <path
          className="checkmark-path"
          d="M20 32 L28 40 L44 24"
          stroke="white"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    </>
  );
}
