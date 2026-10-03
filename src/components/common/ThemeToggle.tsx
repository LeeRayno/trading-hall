'use client';

/**
 * Light/dark switch.
 *
 * The icon shows the theme the click will move to, not the one in force — a
 * sun on a dark page is an offer, and a sun on a dark page as a status report
 * would be lying.
 *
 * Which icon is drawn, and what the button is called, are both decided by CSS
 * selectors on the document's theme attribute. That is not a stylistic
 * choice: this component reads the theme from outside React, so a state-driven
 * icon would be rendered on the server as one thing and corrected on the
 * client, and the correction would be visible. Selectors have no such gap —
 * the markup is right in the first byte, and the button holds no state at all.
 *
 * Both labels are in the DOM and exactly one of them is laid out. `hidden`
 * takes the other out of the accessibility tree entirely, so the name read
 * aloud is the remaining sentence rather than both of them run together.
 */

import { useTranslation } from '@/i18n/I18nProvider';
import { toggleTheme } from '@/lib/theme/theme';

export function ThemeToggle() {
  const t = useTranslation();

  return (
    <button
      type="button"
      onClick={() => toggleTheme()}
      className="inline-flex items-center rounded p-1 text-text-muted transition-colors hover:bg-panel-hover hover:text-text-secondary"
    >
      {/* Dark shows the sun, light shows the moon: both the icon and the
          label name where the click goes, so they are switched by the same
          theme the click would leave. */}
      <SunIcon className="hidden size-4 dark:block" />
      <MoonIcon className="size-4 dark:hidden" />
      <span className="hidden sr-only dark:block">{t('theme.toLight')}</span>
      <span className="sr-only dark:hidden">{t('theme.toDark')}</span>
    </button>
  );
}

interface IconProps {
  className?: string;
}

/** Drawn on the same 24-unit grid as the spinner, so `size-*` scales it. */
function SunIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="4.2" />
      {/* Eight rays rather than twelve: at sixteen pixels the denser ring
          closes up into a blob and stops reading as light. */}
      <path d="M12 2.6v2.2M12 19.2v2.2M4.35 4.35l1.55 1.55M18.1 18.1l1.55 1.55M2.6 12h2.2M19.2 12h2.2M6.66 17.34 4.35 19.65M19.65 4.35 17.34 6.66" />
    </svg>
  );
}

/**
 * A crescent, cut as one path rather than as a circle over a circle: the
 * overlap would need a second fill colour, and this has to work on both
 * palettes from `currentColor` alone.
 */
function MoonIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M20.5 14.1A8.6 8.6 0 0 1 9.9 3.5a8.6 8.6 0 1 0 10.6 10.6Z" />
    </svg>
  );
}
