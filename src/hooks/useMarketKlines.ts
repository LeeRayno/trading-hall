'use client';

/**
 * Candlestick data for one pair and interval.
 *
 * History arrives over REST and each live bar over the shared WebSocket. The
 * two are kept apart deliberately: history is React state because it changes
 * only when the pair or interval does, while live bars are handed to a
 * callback and never touch state. A busy pair pushes a bar every second, and
 * re-rendering the tree at that rate to hand the chart one number is exactly
 * the churn this split avoids.
 *
 * Switching pair or interval tears the old subscription down before the new
 * one is created, so a frame from the previous stream can never land on the
 * new series.
 *
 * Loading and error are derived from which request the stored result answers,
 * rather than set at the top of the effect. That keeps the effect free of
 * synchronous state writes, and it gives a refresh the right behaviour for
 * free: the previous bars stay on screen while the new request is in flight.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  MarketErrorCode,
  toMarketDataError,
  type MarketDataError,
} from '@/lib/market-data/errors';
import { getMarketDataProvider } from '@/lib/market-data/provider';
import type {
  Candle,
  ConnectionState as ConnectionStateValue,
  Symbol,
  Timeframe,
} from '@/lib/market-data/types';

export type KlineStatus = 'loading' | 'ready' | 'error';

export interface UseMarketKlinesOptions {
  symbol: Symbol;
  timeframe: Timeframe;
  /**
   * Called for every live bar. Held in a ref, so changing this callback does
   * not re-open the subscription.
   */
  onCandle?: (candle: Candle) => void;
}

export interface UseMarketKlinesResult {
  status: KlineStatus;
  error: MarketDataError | null;
  connection: ConnectionStateValue;
  /** Ascending history for the current pair and interval; null until loaded. */
  history: Candle[] | null;
  /** Re-fetch history, for example to backfill a gap after a reconnect. */
  refresh: () => void;
}

interface StoredHistory {
  dataKey: string;
  candles: Candle[];
}

interface QueryResult {
  requestKey: string;
  status: 'ready' | 'error';
  error: MarketDataError | null;
}

export function useMarketKlines({
  symbol,
  timeframe,
  onCandle,
}: UseMarketKlinesOptions): UseMarketKlinesResult {
  const provider = getMarketDataProvider();

  /** Identifies the series the bars belong to. */
  const dataKey = `${symbol}|${timeframe}`;

  // Declared before the effects below so it is current by the time either
  // runs, and so a re-created callback never re-opens the subscription.
  const onCandleRef = useRef(onCandle);
  useEffect(() => {
    onCandleRef.current = onCandle;
  });

  const [history, setHistory] = useState<StoredHistory | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [connection, setConnection] = useState(provider.websocket.getConnectionState());
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  const attemptKey = `${dataKey}|${reloadToken}`;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    provider
      .getCandles({ symbol, timeframe }, controller.signal)
      .then((candles) => {
        if (cancelled) return;
        setHistory({ dataKey, candles });
        setResult({ requestKey: attemptKey, status: 'ready', error: null });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const failure = toMarketDataError(cause);
        // An abort is this effect being replaced, not a failure to report.
        if (failure.code === MarketErrorCode.ABORTED) return;
        setResult({ requestKey: attemptKey, status: 'error', error: failure });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [provider, symbol, timeframe, dataKey, attemptKey]);

  useEffect(() => {
    return provider.subscribeCandles(symbol, timeframe, (candle) => {
      onCandleRef.current?.(candle);
    });
  }, [provider, symbol, timeframe]);

  useEffect(() => provider.onConnectionStateChange(setConnection), [provider]);

  const settled = result !== null && result.requestKey === attemptKey ? result : null;

  return {
    status: settled === null ? 'loading' : settled.status,
    error: settled?.error ?? null,
    connection,
    // Guarded by key so the previous pair's bars are never rendered under the
    // new pair's heading, not even for the render before the fetch resolves.
    history: history !== null && history.dataKey === dataKey ? history.candles : null,
    refresh,
  };
}
