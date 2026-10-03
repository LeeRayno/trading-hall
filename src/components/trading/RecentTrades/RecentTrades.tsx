'use client';

/**
 * Recent trades panel.
 *
 * Newest print at the top, which is where a tape is read from (spec §46), with
 * the taker side carried by colour rather than by a fourth column (spec §31).
 *
 * Rows are memoised: the panel republishes on every print, and without it each
 * new print would re-render the whole tape.
 */

import { memo, useCallback, useMemo } from 'react';

import { Spinner } from '@/components/common/Spinner';
import { PanelNotice } from '@/components/trading/PanelNotice';
import { canRetry, describeFailure } from '@/components/trading/failure';
import { useRecentTrades } from '@/hooks/useRecentTrades';
import { useSymbolInfo } from '@/hooks/useSymbolInfo';
import { useI18n } from '@/i18n/I18nProvider';
import { pricePrecisionOf, sizePrecisionOf } from '@/lib/market-data/symbol';
import type { RecentTrade, Symbol } from '@/lib/market-data/types';

interface RecentTradesProps {
  symbol: Symbol;
}

/** Shared by the header and the rows, so the columns cannot drift apart. */
const ROW_GRID = 'grid grid-cols-3 items-center gap-2 px-3';

export function RecentTrades({ symbol }: RecentTradesProps) {
  const { t, locale } = useI18n();
  const { status, error, trades, stale, refresh } = useRecentTrades(symbol);
  const symbolInfo = useSymbolInfo(symbol);

  const pricePrecision = pricePrecisionOf(symbolInfo);
  const sizePrecision = sizePrecisionOf(symbolInfo);

  // One formatter for the whole tape, rebuilt only when the locale changes.
  // A fresh formatter per render would invalidate every memoised row.
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }),
    [locale],
  );
  const formatTime = useCallback(
    (timestamp: number) => formatter.format(timestamp),
    [formatter],
  );

  // Only a tape with nothing on it is worth replacing with an error; once there
  // are prints, they are worth more than the message about the failed refresh.
  const showErrorPanel = status === 'error' && error !== null && trades.length === 0;

  if (showErrorPanel) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm text-down">{describeFailure(t, error)}</p>
        {canRetry(error) ? (
          <button
            type="button"
            onClick={refresh}
            className="rounded border border-border-subtle px-3 py-1 text-xs text-text-secondary transition-colors hover:bg-panel-hover hover:text-foreground"
          >
            {t('common.retry')}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col text-xs">
      <div className={`${ROW_GRID} shrink-0 py-1 text-text-muted`}>
        <span>{t('trade.price')}</span>
        <span className="text-right">{t('trade.size')}</span>
        <span className="text-right">{t('trade.time')}</span>
      </div>


      <div className={`min-h-0 flex-1 overflow-y-auto ${stale ? 'opacity-40' : ''}`}>
        {trades.map((trade) => (
          <TradeRow
            key={trade.id}
            trade={trade}
            pricePrecision={pricePrecision}
            sizePrecision={sizePrecision}
            formatTime={formatTime}
          />
        ))}

        {status === 'loading' && trades.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4">
            <Spinner />
          </div>
        ) : null}

        {status === 'ready' && trades.length === 0 ? (
          <p className="px-3 py-2 text-text-muted">{t('trade.noTrades')}</p>
        ) : null}
      </div>


      {/* The tape cannot empty itself the way the book does — the prints it
          already holds are still real — so a frozen tape is dimmed and said
          to be frozen (spec §36). */}
      {stale ? <PanelNotice position="bottom">{t('errors.reconnecting')}</PanelNotice> : null}
    </div>
  );
}

interface TradeRowProps {
  trade: RecentTrade;
  pricePrecision: number;
  sizePrecision: number;
  formatTime: (timestamp: number) => string;
}

const TradeRow = memo(function TradeRow({
  trade,
  pricePrecision,
  sizePrecision,
  formatTime,
}: TradeRowProps) {
  return (
    <div className={`${ROW_GRID} py-px tabular-nums`}>
      {/* Taker buy on the bid side lifts the price, so it reads as up. */}
      <span className={trade.side === 'buy' ? 'text-up' : 'text-down'}>
        {trade.price.toFixed(pricePrecision)}
      </span>
      <span className="text-right text-text-secondary">
        {trade.size.toFixed(sizePrecision)}
      </span>
      <span className="text-right text-text-muted">{formatTime(trade.timestamp)}</span>
    </div>
  );
});
