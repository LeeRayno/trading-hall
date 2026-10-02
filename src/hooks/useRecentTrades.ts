'use client';

/**
 * Recent trades state for one pair.
 *
 * A REST snapshot fills the tape and the print feed keeps it current; the tape
 * itself owns the cap and the de-duplication (spec §32, §46).
 *
 * The order matters: the feed is subscribed *before* the snapshot is
 * requested, so a print made during the round trip is not lost. That makes
 * overlap between the two possible — the snapshot is generated while prints are
 * still arriving — which is precisely what the id check is for.
 *
 * This stream is deliberately not throttled. The spec's prescribed mitigation
 * for the tape is the record cap rather than a cadence (§38), prints arrive at
 * a human pace rather than hundreds a second, and React already batches
 * updates that land in the same tick.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { MAX_RECENT_TRADES } from '@/config/market';
import {
  MarketDataError,
  MarketErrorCode,
  toMarketDataError,
} from '@/lib/market-data/errors';
import { getMarketDataProvider } from '@/lib/market-data/provider';
import { TradeTape } from '@/lib/market-data/tradeTape';
import {
  ConnectionState as ConnectionStateValue,
  type RecentTrade,
  type Symbol,
} from '@/lib/market-data/types';

export type RecentTradesStatus = 'loading' | 'ready' | 'error';

export interface UseRecentTradesResult {
  status: RecentTradesStatus;
  error: MarketDataError | null;
  connection: ConnectionStateValue;
  /** Prints, newest first. Empty until the first print or snapshot lands. */
  trades: readonly RecentTrade[];
  /** True when the tape is frozen because the feed is down. */
  stale: boolean;
  /** Refetch the recent history, for the retry button. */
  refresh: () => void;
}

interface PublishedTrades {
  symbol: Symbol;
  trades: readonly RecentTrade[];
}

interface Outcome {
  requestKey: string;
  error: MarketDataError | null;
}

/** Stable identity, so a pair with no prints does not churn the component. */
const NO_TRADES: readonly RecentTrade[] = [];

export function useRecentTrades(symbol: Symbol): UseRecentTradesResult {
  const provider = getMarketDataProvider();

  const [tape] = useState(() => new TradeTape(MAX_RECENT_TRADES));
  const [published, setPublished] = useState<PublishedTrades | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [connection, setConnection] = useState(provider.websocket.getConnectionState());
  const [reloadToken, setReloadToken] = useState(0);

  /** Distinguishes the first connect, which the snapshot effect already covers. */
  const sawConnectedRef = useRef(false);

  const requestKey = `${symbol}|${reloadToken}`;

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  // Subscribe first. Prints made before the snapshot arrives are kept, and the
  // snapshot only adds what the tape does not already hold.
  useEffect(() => {
    tape.clear();

    return provider.subscribeTrades(symbol, (trade) => {
      if (!tape.add([trade])) return;
      setPublished({ symbol, trades: [...tape.list] });
    });
  }, [provider, symbol, tape]);

  // Initial history, merged into whatever the feed has already delivered.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    provider
      .getRecentTrades(symbol, controller.signal)
      .then((history) => {
        if (cancelled) return;
        tape.add(history);
        setPublished({ symbol, trades: [...tape.list] });
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
  }, [provider, symbol, requestKey, tape]);

  // A reconnect means the feed was down for a while, so the tape has a hole in
  // it — prints made in between were never delivered and cannot be replayed.
  // Refetching the recent history is what fills it (spec §36, §37).
  useEffect(
    () =>
      provider.onConnectionStateChange((state) => {
        setConnection(state);
        if (state === ConnectionStateValue.CONNECTED) {
          // The first connect is excluded: the snapshot effect is already
          // fetching, and refetching here would duplicate that request.
          if (sawConnectedRef.current) setReloadToken((token) => token + 1);
          sawConnectedRef.current = true;
        }
      }),
    [provider],
  );

  const settled = outcome !== null && outcome.requestKey === requestKey ? outcome : null;
  const error = settled?.error ?? null;
  const isCurrent = published !== null && published.symbol === symbol;
  const trades = isCurrent ? published.trades : NO_TRADES;

  const disconnected =
    connection === ConnectionStateValue.DISCONNECTED ||
    connection === ConnectionStateValue.RECONNECTING ||
    connection === ConnectionStateValue.CLOSED;

  return {
    status: error !== null ? 'error' : isCurrent ? 'ready' : 'loading',
    error,
    connection,
    trades,
    stale: disconnected && trades.length > 0,
    refresh,
  };
}
