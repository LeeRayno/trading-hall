'use client';

/**
 * The hot strip's pairs and their live quotes.
 *
 * Two stages, because they answer different questions. Which pairs are hot is
 * a whole-market question, and the only endpoint that answers it in one request
 * is a 24-hour ticker snapshot — large, and read once, since a ranking that
 * reordered itself while someone was reading it would be worse than a ranking
 * that is a few minutes old. What each of those pairs is doing *now* is a
 * per-pair question, answered by the quote feed.
 *
 * The feed pushes per pair, on its own cadence, so quotes land in a plain Map
 * held in a ref and the component tree is told the result on a timer. Unlike
 * the book's, this timer is not a throttle — ten pairs at about one frame each
 * every two seconds is nothing — but a coalescing window, so quotes that arrive
 * together cost one render rather than ten. Reconnection needs no handling
 * here: a quote is the current state of a pair, not part of a sequence, so the
 * next frame fully restores it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { HOT_SYMBOLS_FLUSH_INTERVAL_MS, HOT_SYMBOLS_LIMIT } from '@/config/market';
import {
  MarketDataError,
  MarketErrorCode,
  toMarketDataError,
} from '@/lib/market-data/errors';
import { rankHotSymbols } from '@/lib/market-data/hotSymbols';
import { getMarketDataProvider } from '@/lib/market-data/provider';
import type { Symbol, SymbolSnapshot } from '@/lib/market-data/types';

export type HotSymbolsStatus = 'loading' | 'ready' | 'error';

export interface HotSymbolItem {
  /** The pair, and the order the strip shows it in. */
  symbol: Symbol;
  /**
   * Its latest quote, or null until the first one arrives. A pair is in the
   * strip as soon as it is ranked, so an item is never missing — only its
   * numbers are, briefly.
   */
  quote: SymbolSnapshot | null;
}

export interface UseHotSymbolsResult {
  status: HotSymbolsStatus;
  error: MarketDataError | null;
  items: readonly HotSymbolItem[];
  /** Re-rank from a fresh ticker snapshot, for the retry button. */
  refresh: () => void;
}

/** The ranking, tagged with the attempt that produced it. */
interface Ranking {
  requestKey: string;
  symbols: readonly Symbol[];
}

interface Outcome {
  requestKey: string;
  error: MarketDataError | null;
}

/** Stable identity, so an empty strip does not churn the component. */
const NO_ITEMS: readonly HotSymbolItem[] = [];

export function useHotSymbols(): UseHotSymbolsResult {
  const provider = getMarketDataProvider();

  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [quotes, setQuotes] = useState<ReadonlyMap<Symbol, SymbolSnapshot> | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  /**
   * Latest quote per pair, for as long as a ranking is subscribed. Written by
   * the feed; read by the flush. Null between rankings.
   */
  const quotesRef = useRef<Map<Symbol, SymbolSnapshot> | null>(null);
  /** Set by the feed, cleared by the flush. Keeps React out of the feed's path. */
  const dirtyRef = useRef(false);

  const requestKey = `hot|${reloadToken}`;

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  // Rank once. Both requests are issued together: the ticker snapshot carries
  // the volumes and the symbol list carries which of those pairs this app can
  // open, and neither answer depends on the other.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    Promise.all([
      provider.getSymbols(controller.signal),
      provider.getTickers(controller.signal),
    ])
      .then(([tradable, tickers]) => {
        if (cancelled) return;
        setRanking({
          requestKey,
          symbols: rankHotSymbols(tickers, tradable, HOT_SYMBOLS_LIMIT),
        });
        setOutcome({ requestKey, error: null });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const failure = toMarketDataError(cause);
        // An abort is this effect being replaced, not a failure to report.
        if (failure.code === MarketErrorCode.ABORTED) return;
        setOutcome({ requestKey, error: failure });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [provider, requestKey]);

  const symbols = ranking !== null && ranking.requestKey === requestKey ? ranking.symbols : null;

  // Subscribe to whatever was ranked. One subscription per pair, which is what
  // the transport's topic dispatch can actually deliver; see
  // `MarketDataWebSocket.subscribeSnapshots`.
  useEffect(() => {
    if (symbols === null) return;

    quotesRef.current = new Map();
    dirtyRef.current = false;

    return provider.subscribeSnapshots(symbols, (snapshot) => {
      quotesRef.current?.set(snapshot.symbol, snapshot);
      dirtyRef.current = true;
    });
  }, [provider, symbols]);

  // Publish on a timer. The only path from the quote feed into React state.
  useEffect(() => {
    const timer = setInterval(() => {
      const latest = quotesRef.current;
      if (!dirtyRef.current || latest === null) return;
      dirtyRef.current = false;
      // The Map is replaced rather than mutated so React sees a new value; the
      // one the component tree already holds is never written to again.
      setQuotes(new Map(latest));
    }, HOT_SYMBOLS_FLUSH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  const items = useMemo(() => {
    if (symbols === null) return NO_ITEMS;
    return symbols.map((symbol) => ({ symbol, quote: quotes?.get(symbol) ?? null }));
  }, [symbols, quotes]);

  const settled = outcome !== null && outcome.requestKey === requestKey ? outcome : null;
  const error = settled?.error ?? null;

  return {
    status: error !== null ? 'error' : symbols !== null ? 'ready' : 'loading',
    error,
    items,
    refresh,
  };
}
