'use client';

import Link from 'next/link';

import { POPULAR_SYMBOLS } from '@/config/market';
import { useI18n } from '@/i18n/I18nProvider';
import { splitSymbol } from '@/lib/market-data/symbol';
import type { Symbol } from '@/lib/market-data/types';

/**
 * Current pair plus quick links to the other tracked markets.
 *
 * Navigation, not state: switching pairs reloads the route so every module
 * tears down its subscriptions through the normal unmount path.
 */
export function SymbolSwitcher({ symbol }: { symbol: Symbol }) {
  const { locale } = useI18n();
  const parts = splitSymbol(symbol);

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-semibold text-foreground">{parts?.base ?? symbol}</span>
        <span className="text-sm text-text-muted">/{parts?.quote ?? ''}</span>
      </div>

      <nav className="flex items-center gap-1">
        {POPULAR_SYMBOLS.map((candidate) => {
          const isActive = candidate === symbol;
          return (
            <Link
              key={candidate}
              href={`/${locale}/trade/${candidate}`}
              aria-current={isActive ? 'page' : undefined}
              className={`rounded px-2 py-1 font-mono text-xs transition-colors ${
                isActive
                  ? 'bg-accent-subtle text-accent'
                  : 'text-text-muted hover:bg-panel-hover hover:text-text-secondary'
              }`}
            >
              {candidate}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
