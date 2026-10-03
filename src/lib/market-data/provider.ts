/**
 * Market data provider.
 *
 * The single entry point every hook depends on. It composes the REST client
 * and the WebSocket manager so consumers never choose a transport, and it is
 * the seam where a different upstream would be swapped in.
 *
 * Dependency direction, enforced by convention:
 *
 *   component -> hook -> provider -> { client, websocket } -> adapter -> upstream
 */

import { MarketDataClient, type MarketDataClientOptions } from './client';
import { MarketDataError, MarketErrorCode } from './errors';
import { DEFAULT_CANDLE_LIMIT } from './endpoints';
import { normalizeSymbol, parseSymbol } from './symbol';
import type {
  Candle,
  CandleQuery,
  OrderBook,
  OrderBookUpdate,
  RecentTrade,
  Symbol,
  SymbolInfo,
  SymbolSnapshot,
  Ticker,
  Timeframe,
  Unsubscribe,
} from './types';
import { MarketDataWebSocket, type MarketDataWebSocketOptions } from './websocket';

export interface MarketDataProviderOptions {
  client?: MarketDataClient;
  clientOptions?: MarketDataClientOptions;
  websocketOptions?: Omit<MarketDataWebSocketOptions, 'client'>;
}

export class MarketDataProvider {
  readonly client: MarketDataClient;
  readonly websocket: MarketDataWebSocket;

  /** Pair metadata is fetched once and shared; it changes very rarely. */
  private symbolsPromise: Promise<SymbolInfo[]> | null = null;

  /** Cancels the shared metadata request. Owned here, not by a caller. */
  private symbolsController: AbortController | null = null;

  /**
   * The whole-market ticker snapshot, shared for the same reason as the pair
   * metadata and one more: it is the largest response in the application, and
   * it is read to rank pairs — a ranking that is deliberately fixed for the
   * session — so a second copy of it buys nothing.
   */
  private tickersPromise: Promise<Ticker[]> | null = null;

  /** Cancels the shared ticker request. Owned here, not by a caller. */
  private tickersController: AbortController | null = null;

  constructor(options: MarketDataProviderOptions = {}) {
    this.client = options.client ?? new MarketDataClient(options.clientOptions);
    this.websocket = new MarketDataWebSocket({
      ...options.websocketOptions,
      client: this.client,
    });
  }

  // ==================== Snapshots and history ====================

  /**
   * Historical candles, ascending.
   *
   * Rejects malformed symbols before spending a request on them.
   */
  async getCandles(query: CandleQuery, signal?: AbortSignal): Promise<Candle[]> {
    const symbol = requireSymbol(query.symbol);
    return this.client.getCandles(
      { ...query, symbol, limit: query.limit ?? DEFAULT_CANDLE_LIMIT },
      signal,
    );
  }

  /** Current book snapshot. */
  async getOrderBookSnapshot(symbol: Symbol, signal?: AbortSignal): Promise<OrderBook> {
    return this.client.getOrderBookSnapshot(requireSymbol(symbol), signal);
  }

  /** Recent public trades, newest first. */
  async getRecentTrades(symbol: Symbol, signal?: AbortSignal): Promise<RecentTrade[]> {
    return this.client.getRecentTrades(requireSymbol(symbol), signal);
  }

  /**
   * 24-hour statistics for every listed pair, for ranking.
   *
   * Fetched at most once per provider instance, and shared by concurrent
   * callers rather than per caller: two components mounting together would
   * otherwise each pull half a megabyte down for an answer they would agree on.
   * The caller's signal decides how long *that caller* waits, exactly as with
   * the pair metadata above.
   */
  async getTickers(signal?: AbortSignal): Promise<Ticker[]> {
    if (!this.tickersPromise) {
      this.tickersController = new AbortController();
      this.tickersPromise = this.client
        .getTickers(this.tickersController.signal)
        .catch((error: unknown) => {
          // Do not cache a failure; the retry button should really retry.
          this.tickersPromise = null;
          throw error;
        });
    }
    return signal ? untilAborted(this.tickersPromise, signal) : this.tickersPromise;
  }

  // ==================== Live streams ====================

  subscribeCandles(
    symbol: Symbol,
    timeframe: Timeframe,
    handler: (candle: Candle) => void,
  ): Unsubscribe {
    return this.websocket.subscribeCandles(requireSymbol(symbol), timeframe, handler);
  }

  subscribeOrderBook(
    symbol: Symbol,
    handler: (update: OrderBookUpdate) => void,
  ): Unsubscribe {
    return this.websocket.subscribeOrderBook(requireSymbol(symbol), handler);
  }

  subscribeTrades(symbol: Symbol, handler: (trade: RecentTrade) => void): Unsubscribe {
    return this.websocket.subscribeTrades(requireSymbol(symbol), handler);
  }

  /** Live quotes for a set of pairs, on one subscription per pair. */
  subscribeSnapshots(
    symbols: readonly Symbol[],
    handler: (snapshot: SymbolSnapshot) => void,
  ): Unsubscribe {
    return this.websocket.subscribeSnapshots(symbols.map(requireSymbol), handler);
  }

  onConnectionStateChange(listener: Parameters<MarketDataWebSocket['onConnectionStateChange']>[0]) {
    return this.websocket.onConnectionStateChange(listener);
  }

  // ==================== Pair metadata ====================

  /**
   * Full tradable symbol list, fetched at most once per provider instance.
   *
   * The request belongs to the session rather than to whichever caller happens
   * to arrive first, because its result is cached and every later caller reuses
   * it. It therefore runs under the provider's own controller: handing it a
   * caller's signal would let one component unmounting cancel a request the
   * others are still waiting on, and — since a rejection clears the cache —
   * leave every consumer without pair metadata for the rest of the page's life.
   * The caller's signal still decides how long *that caller* waits.
   */
  async getSymbols(signal?: AbortSignal): Promise<SymbolInfo[]> {
    if (!this.symbolsPromise) {
      this.symbolsController = new AbortController();
      this.symbolsPromise = this.client
        .getSymbols(this.symbolsController.signal)
        .catch((error: unknown) => {
          // Do not cache a failure; the next caller should retry.
          this.symbolsPromise = null;
          throw error;
        });
    }
    return signal ? untilAborted(this.symbolsPromise, signal) : this.symbolsPromise;
  }

  /** Metadata for one pair, or `undefined` when it is not listed. */
  async getSymbolInfo(symbol: Symbol, signal?: AbortSignal): Promise<SymbolInfo | undefined> {
    const target = normalizeSymbol(symbol);
    const symbols = await this.getSymbols(signal);
    return symbols.find((info) => info.symbol === target);
  }

  // ==================== Lifecycle ====================

  /** Release the shared socket. */
  dispose(): void {
    this.websocket.close();
    // A request still in flight has nobody left to hand its result to, so the
    // rejection that cancelling it produces is claimed here rather than left to
    // surface as an unhandled rejection.
    this.symbolsPromise?.catch(() => {});
    this.symbolsController?.abort();
    this.symbolsController = null;
    this.symbolsPromise = null;

    this.tickersPromise?.catch(() => {});
    this.tickersController?.abort();
    this.tickersController = null;
    this.tickersPromise = null;
  }
}

/**
 * The shared promise, but only for as long as this caller is still interested.
 *
 * Aborting stops the caller from waiting; it deliberately does not reach the
 * request being shared. Handlers stay attached to the inner promise either way,
 * so an abort cannot leave its rejection unhandled.
 */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortFailure());

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortFailure());
    signal.addEventListener('abort', onAbort, { once: true });

    const settle = (settleWith: () => void) => {
      signal.removeEventListener('abort', onAbort);
      settleWith();
    };

    promise.then(
      (value) => settle(() => resolve(value)),
      (error: unknown) => settle(() => reject(error)),
    );
  });
}

/** Same failure the transport produces, so callers see one vocabulary. */
function abortFailure(): MarketDataError {
  return new MarketDataError(MarketErrorCode.ABORTED, 'request aborted');
}

function requireSymbol(raw: Symbol): Symbol {
  const symbol = parseSymbol(raw);
  if (!symbol) {
    throw new MarketDataError(MarketErrorCode.INVALID_SYMBOL, `malformed symbol: ${raw}`);
  }
  return symbol;
}

let sharedProvider: MarketDataProvider | null = null;

/**
 * Process-wide provider instance.
 *
 * One socket per tab is the goal, so consumers share this rather than
 * constructing their own.
 */
export function getMarketDataProvider(): MarketDataProvider {
  if (!sharedProvider) {
    sharedProvider = new MarketDataProvider();
  }
  return sharedProvider;
}
