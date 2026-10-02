/**
 * The market data endpoints this application uses.
 *
 * One function per upstream route. Each builds its own parameters, calls the
 * transport, and hands the raw payload to an adapter. Nothing above this file
 * touches a URL or a raw payload.
 *
 * Upstream-specific knowledge is confined to three files — this one,
 * `endpoints.ts` for the paths, and `adapters/` for the payload shapes — so
 * replacing the upstream means rewriting those and nothing else.
 */

import { HttpError, type HttpClient, type RequestOptions } from '../http/service';
import {
  adaptCandles,
  adaptOrderBookSnapshot,
  adaptPublicToken,
  adaptRecentTrades,
  adaptSymbols,
  unwrapEnvelope,
  type WebSocketGrant,
} from './adapters/marketDataAdapter';
import {
  CANDLE_PAGE_LIMIT,
  DEFAULT_CANDLE_LIMIT,
  ORDER_BOOK_DEPTH,
  REST_PATHS,
  TIMEFRAME_SECONDS,
  toWireInterval,
} from './endpoints';
import { MarketDataError, MarketErrorCode, toMarketDataError } from './errors';
import type {
  Candle,
  CandleQuery,
  OrderBook,
  RecentTrade,
  Symbol,
  SymbolInfo,
} from './types';

/**
 * Fetch a short-lived public WebSocket token and its gateway instances.
 *
 * Tokens expire, so this is called before every connection attempt rather
 * than being cached for the lifetime of the page.
 */
export async function getPublicToken(
  http: HttpClient,
  signal?: AbortSignal,
): Promise<WebSocketGrant> {
  const data = await call(http, {
    method: 'POST',
    path: REST_PATHS.publicToken,
    signal,
    context: 'publicToken',
  });
  return adaptPublicToken(data);
}

/** Historical candles in ascending time order. */
export async function getCandles(
  http: HttpClient,
  query: CandleQuery,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const limit = Math.min(query.limit ?? DEFAULT_CANDLE_LIMIT, CANDLE_PAGE_LIMIT);
  const { startAt, endAt } = resolveCandleRange(query, limit);

  const data = await call(http, {
    method: 'GET',
    path: REST_PATHS.candles,
    query: {
      symbol: query.symbol,
      type: toWireInterval(query.timeframe),
      startAt,
      endAt,
    },
    signal,
    context: 'candles',
  });

  return adaptCandles(data);
}

/** Aggregated top-of-book snapshot, sized for the UI. */
export async function getOrderBookSnapshot(
  http: HttpClient,
  symbol: Symbol,
  signal?: AbortSignal,
): Promise<OrderBook> {
  const data = await call(http, {
    method: 'GET',
    path: REST_PATHS.orderBookSnapshot,
    query: { symbol },
    signal,
    context: 'orderBookSnapshot',
  });
  return adaptOrderBookSnapshot(data, ORDER_BOOK_DEPTH);
}

/**
 * Full-depth snapshot. Only needed when the local book must mirror the
 * whole exchange book; the UI path uses `getOrderBookSnapshot`.
 */
export async function getOrderBookFull(
  http: HttpClient,
  symbol: Symbol,
  signal?: AbortSignal,
): Promise<OrderBook> {
  const data = await call(http, {
    method: 'GET',
    path: REST_PATHS.orderBookFull,
    query: { symbol },
    signal,
    context: 'orderBookFull',
  });
  return adaptOrderBookSnapshot(data);
}

/** Most recent public trades, newest first. */
export async function getRecentTrades(
  http: HttpClient,
  symbol: Symbol,
  signal?: AbortSignal,
): Promise<RecentTrade[]> {
  const data = await call(http, {
    method: 'GET',
    path: REST_PATHS.recentTrades,
    query: { symbol },
    signal,
    context: 'recentTrades',
  });
  return adaptRecentTrades(data);
}

/** Trading rules and precision for every listed pair. */
export async function getSymbols(http: HttpClient, signal?: AbortSignal): Promise<SymbolInfo[]> {
  const data = await call(http, {
    method: 'GET',
    path: REST_PATHS.symbols,
    signal,
    context: 'symbols',
  });
  return adaptSymbols(data);
}

// ==================== Internal ====================

interface CallOptions extends RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  context: string;
}

/**
 * Perform a request and validate the upstream envelope.
 *
 * Two failure vocabularies meet here: `HttpError` from the transport and the
 * upstream's own rejection codes. Both are translated into `MarketDataError`
 * so nothing above this file has to know which layer failed.
 */
async function call(http: HttpClient, options: CallOptions): Promise<unknown> {
  const { method, path, context, ...request } = options;

  let payload: unknown;
  try {
    payload = method === 'POST' ? await http.post(path, request) : await http.get(path, request);
  } catch (error) {
    throw toDomainError(error, context);
  }

  // Throws its own `MarketDataError` for a rejected envelope, which is already
  // in the domain vocabulary and passes through untouched.
  return unwrapEnvelope<unknown>(payload, context);
}

/** Translate a transport failure into the domain's error vocabulary. */
function toDomainError(error: unknown, context: string): MarketDataError {
  if (error instanceof MarketDataError) return error;

  if (error instanceof HttpError) {
    const code = CODE_BY_KIND[error.kind];
    return new MarketDataError(code, `${context}: ${error.message}`, { cause: error });
  }

  return toMarketDataError(error);
}

const CODE_BY_KIND: Readonly<Record<HttpError['kind'], MarketErrorCode>> = {
  aborted: MarketErrorCode.ABORTED,
  timeout: MarketErrorCode.NETWORK,
  network: MarketErrorCode.NETWORK,
  status: MarketErrorCode.UPSTREAM,
  parse: MarketErrorCode.INVALID_RESPONSE,
};

/**
 * Derive the request window for a candle query.
 *
 * When no explicit range is given the window is sized from the bar duration
 * and the desired count, so the caller only has to say "1000 one-minute bars".
 */
function resolveCandleRange(
  query: CandleQuery,
  limit: number,
): { startAt: number; endAt: number } {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const endAt = query.endAt ?? nowSeconds;
  const startAt = query.startAt ?? endAt - limit * TIMEFRAME_SECONDS[query.timeframe];
  return { startAt, endAt };
}
