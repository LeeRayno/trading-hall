'use client';

/**
 * Trading hall shell.
 *
 * Lays out the market view described by the spec: chart on the left, book and
 * trade tape stacked on the right, and the account modules pinned below.
 *
 * The selected interval lives here rather than inside the chart, because it is
 * a property of the view the user is looking at: the chart reads it, and later
 * phases (a shared crosshair readout, deep links) read it too.
 *
 * The chart, the order book and the trade tape are implemented. The account
 * panels below are still placeholders.
 */

import { memo, useState } from 'react';

import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { ThemeToggle } from '@/components/common/ThemeToggle';
import { ChartAttribution } from '@/components/trading/Chart/ChartAttribution';
import { TimeframeSelector } from '@/components/trading/Chart/TimeframeSelector';
import { TradingChart } from '@/components/trading/Chart/TradingChart';
import { HotSymbols } from '@/components/trading/HotSymbols/HotSymbols';
import { OrderBook } from '@/components/trading/OrderBook/OrderBook';
import { Orders } from '@/components/trading/Placeholder/Orders';
import { Position } from '@/components/trading/Placeholder/Position';
import { Panel } from '@/components/trading/Panel';
import { RecentTrades } from '@/components/trading/RecentTrades/RecentTrades';
import { SymbolSwitcher } from '@/components/trading/SymbolSwitcher';
import { DEFAULT_TIMEFRAME } from '@/config/market';
import { useTranslation } from '@/i18n/I18nProvider';
import type { Symbol, Timeframe } from '@/lib/market-data/types';

interface TradingHallProps {
  symbol: Symbol;
}

function TradingHallComponent({ symbol }: TradingHallProps) {
  const t = useTranslation();
  const [timeframe, setTimeframe] = useState<Timeframe>(DEFAULT_TIMEFRAME);

  return (
    <div className="flex flex-1 flex-col lg:h-dvh lg:flex-none">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border-subtle bg-panel px-4 py-3">
        <div className="flex items-center gap-4">
          <SymbolSwitcher symbol={symbol} />
        </div>
        {/* One child on the right, not two: `justify-between` spreads its
            children, so a second sibling here would sit in the middle of the
            header rather than against the edge. */}
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      {/* A fixed-height band between the header and the modules: it is the only
          part of the hall that is decoration as much as data, and holding its
          height means the workspace below does not shift when the ranking
          lands, or when the strip is collapsed. */}
      <HotSymbols />

      {/* `lg:min-h-110` is 440px: the book's 320px plus a floor of 120px for the
          tape, which is about as short as the tape is still readable at. The
          hall is a definite viewport height on lg, so without this floor a
          window shorter than the two panels squeeze the tape down to nothing —
          at 500px tall it measured 2px. With it, the grid stops shrinking at
          440 and the page scrolls instead, which is what it did before the
          column was made to fill. */}
      <div className="grid flex-1 grid-cols-1 bg-border-subtle lg:min-h-110 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="bg-background p-2">
          <Panel
            title={t('trade.chart')}
            actions={<TimeframeSelector value={timeframe} onChange={setTimeframe} />}
            className="h-105 lg:h-full"
            bodyClassName="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1">
              <TradingChart symbol={symbol} timeframe={timeframe} />
            </div>
            <ChartAttribution />
          </Panel>
        </div>

        <div className="flex min-h-0 flex-1 flex-col bg-background py-2 ">

        <div className="flex min-h-0 flex-1 flex-col gap-px bg-border-subtle">
          <Panel
            title={t('trade.orderBook')}
            className="h-80"
            bodyClassName="flex min-h-0 flex-1 flex-col"
          >
            <OrderBook symbol={symbol} />
          </Panel>
          {/* The tape takes whatever the column has left over rather than a
              fixed 320px, because it is the panel that happens to be last: with
              both panels sized, anything the grid row had beyond the two of them
              was left as an empty strip under the tape, painted with the rail's
              own background. The book keeps its height, which is what the
              ladder's visible depth was tuned against. */}
          <Panel
            title={t('trade.recentTrades')}
            className="h-80 lg:h-auto lg:min-h-0 lg:flex-1"
            bodyClassName="flex min-h-0 flex-1 flex-col"
          >
            <RecentTrades symbol={symbol} />
          </Panel>
        </div>
        </div>

      </div>

      <div className="grid grid-cols-1 gap-px border-t border-border-subtle bg-border-subtle lg:grid-cols-2">
        <div className="bg-background p-2">
          <Position />
        </div>
        <div className="bg-background p-2">
          <Orders />
        </div>
      </div>
    </div>
  );
}

export const TradingHall = memo(TradingHallComponent);
