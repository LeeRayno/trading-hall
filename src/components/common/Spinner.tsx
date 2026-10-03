'use client';

/**
 * Loading indicator.
 *
 * A ring with a gap, turning — it replaces the "loading" wording that every
 * panel used to print. The wording was not wrong, but it was a different
 * length in every language and it read as content: a panel that says a
 * sentence while it waits looks like a panel that has something to say. A
 * shape says the same thing in every locale, in a box the same size every
 * time, which is what the fixed-height panels around it want.
 *
 * The word is hidden rather than dropped. It is still what the status region
 * announces, so the state reaches a screen reader as language instead of
 * being carried by a shape alone.
 */

import { useI18n } from '@/i18n/I18nProvider';

interface SpinnerProps {
  /**
   * Sizing, and only sizing.
   *
   * The colour is deliberately not a prop: two spinners in two colours read as
   * two different states, and the cheapest way to keep that from happening is
   * to make it impossible. A panel that wants a different colour wants it for
   * its own text too, and this inherits from there.
   *
   * It is a step brighter than the muted tone the placeholders use, because a
   * hairline of that tone on the panel colour measured at 3.9:1 and read as a
   * smudge: this is a two-pixel stroke on a twenty-pixel ring, and thin bright
   * things lose more to the background than their contrast ratio suggests.
   */
  className?: string;
}

/** Drawn on a 24-unit grid, so `size-*` scales it without touching the file. */
const RADIUS = 9;

const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * About a third of the ring.
 *
 * Enough of a gap that the turn is visible at sixteen pixels, where a shorter
 * one reads as a dotted circle rather than as something moving.
 */
const ARC = CIRCUMFERENCE / 3;

export function Spinner({ className = 'size-5' }: SpinnerProps) {
  const { t } = useI18n();

  return (
    <span role="status" className={`inline-flex text-text-secondary ${className}`}>
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        // Reduced motion gets a pulse instead of a stop: a ring that has
        // stopped turning is indistinguishable from a ring that failed to
        // start, and the fade carries the same "still working" without any
        // rotation to sit through.
        className="size-full animate-spin motion-reduce:animate-pulse"
      >
        {/* The faint ring is what makes the gap read as a gap rather than as a
            shape that happens to be open at one end. */}
        <circle
          cx="12"
          cy="12"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.15"
          strokeWidth="2.5"
        />
        <circle
          cx="12"
          cy="12"
          r={RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${ARC} ${CIRCUMFERENCE - ARC}`}
        />
      </svg>
      <span className="sr-only">{t('common.loading')}</span>
    </span>
  );
}
