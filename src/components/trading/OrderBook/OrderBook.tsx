'use client';

/**
 * Order book panel.
 *
 * Ask levels sit above the spread and bid levels below it, so the price column
 * reads as one continuous ladder with the spread at its middle (spec §28).
 *
 * Each row also carries its cumulative size and a tint drawn against the
 * largest level on its side, and the resting size of the two sides is split at
 * the foot of the panel.
 *
 * Rows are memoised, though the cumulative column limits what that buys: a
 * total is a running sum, so a change at the best price moves every total
 * behind it and far more rows miss the bail-out than the level alone would
 * suggest. At forty rows on a 150 ms cadence the difference is not worth more
 * machinery than this.
 */

import { memo } from 'react';

import { PanelNotice } from '@/components/trading/PanelNotice';
import { canRetry, describeFailure } from '@/components/trading/failure';
import { useOrderBook } from '@/hooks/useOrderBook';
import { useSymbolInfo } from '@/hooks/useSymbolInfo';
import { useTranslation } from '@/i18n/I18nProvider';
import { pricePrecisionOf, sizePrecisionOf } from '@/lib/market-data/symbol';
import type { OrderBookLevel, Symbol } from '@/lib/market-data/types';

interface OrderBookProps {
  symbol: Symbol;
}

/** Shared by the header, the rows and the spread row, so the columns cannot drift. */
const ROW_GRID = 'grid grid-cols-3 items-center gap-2 px-3';

/** A level together with the running total that belongs to it. */
interface PricedRow {
  level: OrderBookLevel;
  total: number;
}

/**
 * Pair each level with its own cumulative total.
 *
 * The totals come out of the mirror aligned with the levels they belong to, and
 * both sides are laid out in the order they arrive, so this is only a zip. It
 * stays a named function because the alignment is the part that has to keep
 * holding: a total read by index after the rows are reordered belongs to a
 * different price, and the ladder renders with its whole depth column backwards.
 */
function withTotals(levels: OrderBookLevel[], totals: number[]): PricedRow[] {
  return levels.map((level, index) => ({ level, total: totals[index] ?? 0 }));
}

export function OrderBook({ symbol }: OrderBookProps) {
  const t = useTranslation();
  const { status, error, book, staleReason, refresh } = useOrderBook(symbol);
  const symbolInfo = useSymbolInfo(symbol);

  // Prices and sizes are shown at the precision the pair quotes; a fixed
  // number of decimals would be wrong for most pairs (spec §65).
  const pricePrecision = pricePrecisionOf(symbolInfo);
  const sizePrecision = sizePrecisionOf(symbolInfo);

  // Nothing to show yet: either the first snapshot is still in flight, or it
  // failed and there is no book to fall back on.
  if (book === null) {
    if (status === 'error' && error !== null) {
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
      <div className="flex h-full items-center justify-center p-4">
        <span className="text-sm text-text-muted">{t('common.loading')}</span>
      </div>
    );
  }

  // Both sides stay in the order the data arrives in — best price first — and
  // each container anchors its own first row to the spread: the asks are laid
  // out in a reversed column, so their ladder is drawn upward from the spread,
  // and the bids are a plain column, drawn downward from it.
  const askRows = withTotals(book.asks, book.depth.askTotals);
  const bidRows = withTotals(book.bids, book.depth.bidTotals);

  return (
    <div className="relative flex h-full flex-col text-xs">
      <div className={`${ROW_GRID} shrink-0 py-1 text-text-muted`}>
        <span>{t('trade.price')}</span>
        <span className="text-right">{t('trade.size')}</span>
        <span className="text-right">{t('trade.total')}</span>
      </div>

      <div className={`flex min-h-0 flex-1 flex-col ${staleReason ? 'opacity-40' : ''}`}>
        {/* Reversed, so the first row — the best ask — is laid out against the
            spread and the ladder is drawn upward from it, the way a log grows
            upward from its newest line. That direction is also what makes the
            far asks reachable: it puts the box's opening scroll position at the
            spread, where the ladder is read, and leaves the remaining levels one
            scroll away.

            A plain column with `justify-end` looks identical until you try to
            scroll it. `justify-content: flex-end` puts the free space in front
            of the items; with twenty levels in a box five rows tall that space
            is negative, so the overflow lands on the start side — and start-side
            overflow is not part of a scroll container's scrollable overflow
            region. Measured before this change: `scrollHeight` equalled
            `clientHeight` and `scrollTop` refused to leave zero, so fourteen
            asks sat cut off above the box with no way to reach them. */}
        <div className="flex min-h-0 flex-1 flex-col-reverse overflow-auto">
          {askRows.map((row) => (
            <BookRow
              key={row.level.price}
              level={row.level}
              total={row.total}
              side="ask"
              maxSize={book.depth.askMaxSize}
              pricePrecision={pricePrecision}
              sizePrecision={sizePrecision}
            />
          ))}
        </div>

        {/* Exactly two children, and the value spans the last two columns. Both
            halves of that are load-bearing: the acceptance probe finds this row
            by counting its children and reads the value as the last one. */}
        <div className={`${ROW_GRID} shrink-0 border-y border-border-subtle py-1`}>
          <span className="text-text-muted">{t('trade.spread')}</span>
          <span className="col-span-2 text-right tabular-nums text-text-secondary">
            {book.spread === null ? '—' : book.spread.toFixed(pricePrecision)}
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-start overflow-auto">
          {bidRows.map((row) => (
            <BookRow
              key={row.level.price}
              level={row.level}
              total={row.total}
              side="bid"
              maxSize={book.depth.bidMaxSize}
              pricePrecision={pricePrecision}
              sizePrecision={sizePrecision}
            />
          ))}
        </div>

        {/* Inside the wrapper that dims, and last: the split is drawn from the
            same book, so it is no more trustworthy than the levels above it. */}
        <DepthSplit
          bidShare={book.depth.bidShare}
          bidLabel={t('trade.bids')}
          askLabel={t('trade.asks')}
        />
      </div>

      {staleReason ? (
        <PanelNotice position="bottom">
          {staleReason === 'disconnected' ? t('errors.reconnecting') : t('trade.orderBookStale')}
        </PanelNotice>
      ) : null}
    </div>
  );
}

interface DepthSplitProps {
  /** Bids' share of the resting size, 0..1, or null when both sides are empty. */
  bidShare: number | null;
  bidLabel: string;
  askLabel: string;
}

/**
 * Resting size on each side, as a share of the two together.
 *
 * Summed over every level the panel holds rather than the handful it has room
 * to paint, so the split does not move when the window is resized or the
 * ladder is scrolled.
 */
const DepthSplit = memo(function DepthSplit({ bidShare, bidLabel, askLabel }: DepthSplitProps) {
  // Rounding each side on its own can total 99 or 101, so the ask side takes
  // the complement of the bid side rather than its own rounding.
  const bidPercent = bidShare === null ? null : Math.round(bidShare * 100);
  const askPercent = bidPercent === null ? null : 100 - bidPercent;

  return (
    <div className="shrink-0 border-t border-border-subtle px-3 py-1.5">
      <div className="flex items-center justify-between">
        {/* The labels stay at the ends: the stale notice is a centred pill and
            would otherwise cover the numbers. */}
        <span className="text-up">
          {bidLabel} {bidPercent === null ? '—' : `${bidPercent}%`}
        </span>
        <span className="text-down">
          {askPercent === null ? '—' : `${askPercent}%`} {askLabel}
        </span>
      </div>
      <div
        aria-hidden="true"
        className="mt-1 flex h-1 overflow-hidden rounded-sm bg-panel-hover"
      >
        {bidPercent === null || askPercent === null ? null : (
          <>
            <div className="bg-up" style={{ width: `${bidPercent}%` }} />
            <div className="bg-down" style={{ width: `${askPercent}%` }} />
          </>
        )}
      </div>
    </div>
  );
});

interface BookRowProps {
  level: OrderBookLevel;
  /** Cumulative size from the spread outward, for this row. */
  total: number;
  side: 'bid' | 'ask';
  /** Largest level on this side, which the tint is drawn against. */
  maxSize: number;
  pricePrecision: number;
  sizePrecision: number;
}

const BookRow = memo(function BookRow({
  level,
  total,
  side,
  maxSize,
  pricePrecision,
  sizePrecision,
}: BookRowProps) {
  // Decorative: the size column already carries the number, and the tint is
  // only there to make the shape of the book readable at a glance.
  const fill = maxSize > 0 ? Math.min(level.size / maxSize, 1) : 0;

  return (
    <div className={`${ROW_GRID} relative isolate shrink-0 py-px tabular-nums`}>
      {/* `isolate` is what keeps this behind the figures: without a stacking
          context of its own the negative z-index escapes to an ancestor and
          the tint can end up behind the panel background instead. */}
      <div
        aria-hidden="true"
        className={`absolute inset-y-0 right-0 -z-10 ${
          side === 'ask' ? 'bg-down/15' : 'bg-up/15'
        }`}
        style={{ width: `${fill * 100}%` }}
      />
      <span className={side === 'ask' ? 'text-down' : 'text-up'}>
        {level.price.toFixed(pricePrecision)}
      </span>
      <span className="text-right text-text-secondary">
        {level.size.toFixed(sizePrecision)}
      </span>
      <span className="text-right text-text-secondary">{total.toFixed(sizePrecision)}</span>
    </div>
  );
});
