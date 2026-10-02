'use client';

/**
 * Order book state for one pair.
 *
 * The book is a local mirror: one REST snapshot establishes it, the
 * incremental feed keeps it current, and a sequence check decides whether it
 * can still be believed (spec §16, §30).
 *
 * Nothing here re-renders on a market frame. Updates land in a plain data
 * structure held in a ref; the component tree is told the result on a timer,
 * because the feed pushes hundreds of frames a second and React has no
 * business seeing them (spec §29, §38).
 *
 * The order matters and is not incidental: the feed is subscribed *before* the
 * snapshot is requested, and frames that arrive in between are held aside.
 * The snapshot is generated in the past — the round trip guarantees it — so
 * without those held frames the first live increment would look like a gap and
 * the mirror would rebuild on every startup.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ORDER_BOOK_DISPLAY_DEPTH,
  ORDER_BOOK_FLUSH_INTERVAL_MS,
  ORDER_BOOK_MAX_LEVELS,
  ORDER_BOOK_MAX_RESYNC_ATTEMPTS,
} from '@/config/market';
import {
  MarketDataError,
  MarketErrorCode,
  toMarketDataError,
} from '@/lib/market-data/errors';
import {
  LocalOrderBook,
  depthOf,
  spreadOf,
  type OrderBookDepth,
} from '@/lib/market-data/orderBook';
import { getMarketDataProvider } from '@/lib/market-data/provider';
import {
  ConnectionState as ConnectionStateValue,
  type OrderBookLevel,
  type OrderBookUpdate,
  type Symbol,
} from '@/lib/market-data/types';

export type OrderBookStatus = 'loading' | 'ready' | 'error';

/** The book as the component tree sees it: ordered arrays, no maps. */
export interface OrderBookView {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  /** Cumulative totals, per-row bar denominators, and the resting split. */
  depth: OrderBookDepth;
  /** Best ask minus best bid, or null when either side is empty. */
  spread: number | null;
  /** Provider sequence the view reflects. */
  sequence: number;
}

export interface UseOrderBookResult {
  status: OrderBookStatus;
  error: MarketDataError | null;
  connection: ConnectionStateValue;
  /** Latest published book, or null before the first snapshot lands. */
  book: OrderBookView | null;
  /**
   * Why the book cannot be trusted, or null when it is live. The last good
   * book stays on screen either way, marked as such.
   */
  staleReason: 'disconnected' | 'rebuilding' | null;
  /** Rebuild from a fresh snapshot, resetting the rebuild budget. */
  refresh: () => void;
}

interface LiveBook {
  symbol: Symbol;
  book: LocalOrderBook;
}

interface Outcome {
  attemptKey: string;
  error: MarketDataError | null;
}

type PublishedBook = OrderBookView & { symbol: Symbol };

export function useOrderBook(symbol: Symbol): UseOrderBookResult {
  const provider = getMarketDataProvider();

  const [published, setPublished] = useState<PublishedBook | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [connection, setConnection] = useState(provider.websocket.getConnectionState());
  const [resyncing, setResyncing] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  /** The mirror, or null while it cannot be trusted. */
  const liveRef = useRef<LiveBook | null>(null);
  /** Frames received while no trustworthy mirror exists. */
  const bufferRef = useRef<OrderBookUpdate[]>([]);
  /** Set by the feed; cleared by the flush. Keeps React out of the hot path. */
  const dirtyRef = useRef(false);
  const rebuildsRef = useRef(0);
  const sawConnectedRef = useRef(false);

  const attemptKey = `${symbol}|${reloadToken}`;

  /**
   * Drop the mirror and rebuild it from a fresh snapshot.
   *
   * The subscription is left alone. The topic has not changed, so
   * re-subscribing would only duplicate a feed the socket is already
   * delivering — the mirror is the part that went bad, not the stream.
   */
  const requestRebuild = useCallback(() => {
    liveRef.current = null;
    bufferRef.current = [];
    setResyncing(true);
    setReloadToken((token) => token + 1);
  }, []);

  /** Explicit user retry: same rebuild, but the budget starts over. */
  const refresh = useCallback(() => {
    rebuildsRef.current = 0;
    requestRebuild();
  }, [requestRebuild]);

  // Subscribe first, so the frames that straddle the snapshot are captured
  // rather than lost. See the note at the top of the file.
  useEffect(() => {
    liveRef.current = null;
    bufferRef.current = [];
    dirtyRef.current = false;

    return provider.subscribeOrderBook(symbol, (update) => {
      const live = liveRef.current;

      // No mirror yet for this pair — hold the frame for the drain instead.
      if (!live || live.symbol !== symbol) {
        bufferRef.current.push(update);
        return;
      }

      const result = live.book.apply(update);
      if (result === 'gap') {
        requestRebuild();
        return;
      }
      if (result === 'applied') {
        live.book.prune(ORDER_BOOK_MAX_LEVELS);
        dirtyRef.current = true;
      }
    });
  }, [provider, symbol, requestRebuild]);

  // Establish the mirror from a snapshot, then catch it up with whatever
  // arrived while the request was in flight.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const giveUp = (error: MarketDataError) => {
      liveRef.current = null;
      setResyncing(false);
      setOutcome({ attemptKey, error });
    };

    provider
      .getOrderBookSnapshot(symbol, controller.signal)
      .then((snapshot) => {
        if (cancelled) return;

        const book = new LocalOrderBook(snapshot);

        // Replay the held frames. Anything the snapshot already covers is
        // dropped by the sequence check; a hole means the snapshot and the
        // feed cannot be reconciled into one consistent book.
        let holed = false;
        for (const update of bufferRef.current) {
          if (book.apply(update) === 'gap') {
            holed = true;
            break;
          }
        }
        bufferRef.current = [];

        if (holed) {
          // Rebuilding costs a request, so a feed that keeps arriving with
          // holes is retried a bounded number of times and then reported
          // rather than allowed to hammer the API.
          if (rebuildsRef.current < ORDER_BOOK_MAX_RESYNC_ATTEMPTS) {
            rebuildsRef.current += 1;
            requestRebuild();
            return;
          }
          giveUp(
            new MarketDataError(
              MarketErrorCode.SEQUENCE_GAP,
              `order book: ${ORDER_BOOK_MAX_RESYNC_ATTEMPTS} rebuilds without a consistent book`,
            ),
          );
          return;
        }

        rebuildsRef.current = 0;
        liveRef.current = { symbol, book };
        dirtyRef.current = true;
        setResyncing(false);
        setOutcome({ attemptKey, error: null });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        const failure = toMarketDataError(cause);
        // An abort is this effect being replaced, not a failure to report.
        if (failure.code === MarketErrorCode.ABORTED) return;
        giveUp(failure);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [provider, symbol, attemptKey, requestRebuild]);

  // Publish on a timer. This is the only path into React state at market
  // rate, and it runs at a fixed cadence no matter how fast the feed is.
  useEffect(() => {
    const timer = setInterval(() => {
      const live = liveRef.current;
      if (!live || !dirtyRef.current) return;
      dirtyRef.current = false;

      const { bids, asks } = live.book.levels(ORDER_BOOK_DISPLAY_DEPTH);
      setPublished({
        symbol: live.symbol,
        bids,
        asks,
        depth: depthOf(bids, asks),
        spread: spreadOf(bids, asks),
        sequence: live.book.sequence,
      });
    }, ORDER_BOOK_FLUSH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  useEffect(
    () =>
      provider.onConnectionStateChange((state) => {
        setConnection(state);

        // A reconnect means the feed was down for a while, so the mirror
        // missed whatever happened in between and must be rebuilt. The first
        // connect is excluded — the snapshot effect already covers it.
        if (state === ConnectionStateValue.CONNECTED) {
          if (sawConnectedRef.current) requestRebuild();
          sawConnectedRef.current = true;
        }
      }),
    [provider, requestRebuild],
  );

  const settled = outcome !== null && outcome.attemptKey === attemptKey ? outcome : null;
  const book = published !== null && published.symbol === symbol ? published : null;
  const error = settled?.error ?? null;

  const disconnected =
    connection === ConnectionStateValue.DISCONNECTED ||
    connection === ConnectionStateValue.RECONNECTING ||
    connection === ConnectionStateValue.CLOSED;

  // A book we cannot vouch for is still worth showing, as long as it is
  // plainly marked as behind rather than passed off as live (spec §44).
  // Losing the feed outranks a rebuild: it is the reason for one.
  const staleReason: UseOrderBookResult['staleReason'] =
    book === null ? null : disconnected ? 'disconnected' : resyncing ? 'rebuilding' : null;

  return {
    status: error ? 'error' : book !== null ? 'ready' : 'loading',
    error,
    connection,
    book,
    staleReason,
    refresh,
  };
}
