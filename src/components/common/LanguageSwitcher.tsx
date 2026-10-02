'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useI18n } from '@/i18n/I18nProvider';
import { LOCALES, LOCALE_LABELS } from '@/i18n/config';

/**
 * Switches language while staying on the current page.
 *
 * The locale is whatever occupies the first path segment, so this works for
 * any route shape without knowing the route structure.
 */
export function LanguageSwitcher() {
  const { locale } = useI18n();
  const pathname = usePathname();

  const segments = pathname.split('/').filter(Boolean);
  const rest = segments.slice(1);

  return (
    <nav className="flex items-center gap-1" aria-label="language">
      {LOCALES.map((candidate) => {
        const isActive = candidate === locale;
        const href = `/${[candidate, ...rest].join('/')}`;

        return (
          <Link
            key={candidate}
            href={href}
            aria-current={isActive ? 'true' : undefined}
            className={`rounded px-2 py-1 text-xs transition-colors ${
              isActive
                ? 'bg-accent-subtle text-accent'
                : 'text-text-muted hover:bg-panel-hover hover:text-text-secondary'
            }`}
          >
            {LOCALE_LABELS[candidate]}
          </Link>
        );
      })}
    </nav>
  );
}
