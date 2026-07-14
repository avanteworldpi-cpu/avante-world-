interface VerificationRingProps {
  /**
   * 0-1. A full circle at 1 (verified), a partial arc below it (still building trust).
   *
   * PLACEHOLDER. This is not wired to any trust-score calculation -- none exists. Every
   * caller currently passes a hardcoded literal. Computing a real score is Phase 3 work;
   * until then, treat any value here as illustrative.
   */
  progress: number;
  /** Outer diameter in px. */
  size?: number;
  strokeWidth?: number;
  /** Describes what the ring is asserting, for screen readers. */
  label?: string;
  className?: string;
}

/**
 * The verification motif: a ring that closes as trust is established.
 *
 * Reserved strictly for trust and verification contexts -- currently the verified-business
 * badge in the messages panel. It is deliberately NOT used for the nav rail's active tab or
 * the minimap's heading indicator: reusing it for "active" or "facing" would dilute what a
 * closed ring means. Those get their own treatments.
 */
export function VerificationRing({
  progress,
  size = 18,
  strokeWidth = 2,
  label,
  className,
}: VerificationRingProps) {
  const clamped = Math.min(1, Math.max(0, progress));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const isComplete = clamped >= 1;

  const describedAs =
    label ?? (isComplete ? 'Verified' : `Verification ${Math.round(clamped * 100)}% complete`);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={describedAs}
    >
      {/* Track: the unearned remainder of the ring. */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        className="stroke-dusk-700"
      />

      {/* Arc. Rotated -90deg so it starts at 12 o'clock rather than 3 o'clock. */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className={isComplete ? 'stroke-accent' : 'stroke-accent-strong'}
      />
    </svg>
  );
}
