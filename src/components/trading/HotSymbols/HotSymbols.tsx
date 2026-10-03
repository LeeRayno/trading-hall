'use client';

/**
 * Hot pairs strip.
 *
 * The busiest markets, scrolling under the header. Every entry is a link to
 * that pair, so the strip doubles as navigation — which is also why the pairs
 * are restricted to ones this app can open; see `rankHotSymbols`.
 *
 * The scroll is CSS only: the track holds the pairs twice and travels half its
 * own width, so the second copy lands where the first began. The duplicate is
 * decorative and marked `inert`, which keeps ten pairs of duplicate links out
 * of the tab order and out of what a screen reader reads.
 *
 * The numbers are pushed, not polled: a pair is shown as soon as it is ranked
 * and fills in when its first quote arrives.
 */

import Link from 'next/link';
import { memo, useMemo, useState } from 'react';

import { useHotSymbols, type HotSymbolItem } from '@/hooks/useHotSymbols';
import { useSymbolInfo } from '@/hooks/useSymbolInfo';
import { canRetry, describeFailure } from '@/components/trading/failure';
import { useI18n } from '@/i18n/I18nProvider';
import { pricePrecisionOf, splitSymbol } from '@/lib/market-data/symbol';
import type { Locale } from '@/i18n/config';
import type { Symbol } from '@/lib/market-data/types';

export function HotSymbols() {
  const { t, locale } = useI18n();
  const { status, error, items, refresh } = useHotSymbols();
  const [expanded, setExpanded] = useState(true);

  // One formatter for the whole strip, rebuilt only when the locale changes.
  // A fresh one per render would invalidate every memoised row.
  const formatPercent = useMemo(() => {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      // The sign is the point: a change rate is read as a rise or a fall, and
      // a bare "2.06%" would leave that to the colour alone.
      signDisplay: 'always',
    });
    return (rate: number) => formatter.format(rate);
  }, [locale]);

  return (
    <div className="flex h-8 shrink-0 items-center gap-3 border-b border-border-subtle bg-panel px-3">
      <div className="flex shrink-0 items-center gap-1.5">
        <FlameIcon />
        <span className="text-xs font-medium text-text-secondary">{t('trade.hot')}</span>
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-label={t(expanded ? 'trade.hotCollapse' : 'trade.hotExpand')}
          className="rounded p-0.5 text-text-muted transition-colors hover:bg-panel-hover hover:text-foreground"
        >
          <ChevronIcon collapsed={!expanded} />
        </button>
      </div>

      {/* The ranking failed, so there is nothing to scroll and the reason is
          worth more than the space it takes. */}
      {status === 'error' && error !== null ? (
        <div className="flex min-w-0 items-center gap-3">
          <p className="truncate text-xs text-text-muted">{describeFailure(t, error)}</p>
          {canRetry(error) ? (
            <button
              type="button"
              onClick={refresh}
              className="shrink-0 rounded border border-border-subtle px-2 py-0.5 text-xs text-text-secondary transition-colors hover:bg-panel-hover hover:text-foreground"
            >
              {t('common.retry')}
            </button>
          ) : null}
        </div>
      ) : null}

      {expanded && items.length > 0 ? (
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div className="flex w-max animate-marquee hover:[animation-play-state:paused] motion-reduce:animate-none">
            <Track items={items} locale={locale} formatPercent={formatPercent} />
            {/* Painted only so the loop has something to run into. Hidden from
                assistive technology and made `inert`, or every pair would be
                read and tabbed through twice. */}
            <Track items={items} locale={locale} formatPercent={formatPercent} decorative />
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface TrackProps {
  items: readonly HotSymbolItem[];
  locale: Locale;
  formatPercent: (rate: number) => string;
  decorative?: boolean;
}

function Track({ items, locale, formatPercent, decorative }: TrackProps) {
  return (
    <div
      className="flex w-max shrink-0"
      // `inert` is what actually keeps the duplicate out of the tab order; the
      // attribute alongside it is for assistive technology that predates it.
      aria-hidden={decorative ? true : undefined}
      // inert={decorative === true}
    >
      {items.map((item) => (
        <HotItem
          key={item.symbol}
          symbol={item.symbol}
          price={item.quote?.price ?? null}
          changeRate={item.quote?.changeRate ?? null}
          locale={locale}
          formatPercent={formatPercent}
        />
      ))}
    </div>
  );
}

interface HotItemProps {
  symbol: Symbol;
  /** Null until this pair's first quote arrives. */
  price: number | null;
  changeRate: number | null;
  locale: Locale;
  formatPercent: (rate: number) => string;
}

/**
 * Memoised: the strip publishes every pair's quote together, so without this
 * each flush would re-render all ten entries to change one of them.
 */
const HotItem = memo(function HotItem({
  symbol,
  price,
  changeRate,
  locale,
  formatPercent,
}: HotItemProps) {
  const symbolInfo = useSymbolInfo(symbol);
  const parts = splitSymbol(symbol);

  const direction =
    changeRate === null || changeRate === 0
      ? 'text-text-muted'
      : changeRate > 0
        ? 'text-up'
        : 'text-down';

  return (
    <Link
      href={`/${locale}/trade/${symbol}`}
      className="me-6 flex items-baseline gap-2 rounded px-1 py-0.5 font-mono text-xs tabular-nums transition-colors hover:bg-panel-hover"
    >
      <span className="text-text-secondary">
        {parts?.base ?? symbol}
        {parts ? <span className="text-text-muted">/{parts.quote}</span> : null}
      </span>
      <span className={direction}>{changeRate === null ? '--' : formatPercent(changeRate)}</span>
      <span className="text-foreground">
        {price === null ? '--' : price.toFixed(pricePrecisionOf(symbolInfo))}
      </span>
    </Link>
  );
});

/** Inline so the strip pulls in no icon dependency for two glyphs. */
function FlameIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="size-3.5 shrink-0 fill-accent"
    >
      <path d="M8 0.5c0.5 2.2 1.9 3.2 3.1 4.6C12.6 6.7 13.5 8 13.5 9.7a5.5 5.5 0 0 1-11 0c0-1.3 0.6-2.5 1.6-3.6 0.2 0.9 0.7 1.5 1.4 1.8C5.2 5.6 5.6 3 8 0.5Z" />
    </svg>
  );
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={`size-3.5 shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`}
    >
      <path
        d="M4 6.5 8 10.5 12 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
