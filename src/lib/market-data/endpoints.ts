/**
 * Provider endpoint catalogue.
 *
 * Everything provider-specific is confined to this file, `trading.ts` and the
 * adapter module, so replacing the upstream means rewriting those and nothing
 * else.
 *
 * REST paths here are upstream-relative, and are consumed only by
 * `trading.ts`. The browser never builds one: it calls the same-origin proxy,
 * which re-attaches the upstream API prefix and forwards the request. The
 * public REST endpoints send no CORS headers, so a direct browser call is not
 * possible. See `config/api.ts`.
 */

import type { Symbol, Timeframe } from './types';

/** Upstream REST routes, relative to the upstream API prefix. */
export const REST_PATHS = {
  /** Issues the short-lived public WebSocket token plus server instances. */
  publicToken: '/v1/bullet-public',
  /** Historical candles. One page holds at most `CANDLE_PAGE_LIMIT` bars. */
  candles: '/v1/market/candles',
  /** Aggregated top-of-book snapshot; cheap and recommended for the UI. */
  orderBookSnapshot: '/v1/market/orderbook/level2_20',
  /** Full-depth snapshot, reserved for when deeper books are needed. */
  orderBookFull: '/v3/market/orderbook/level2',
  /** Most recent public trades. */
  recentTrades: '/v1/market/histories',
  /** Trading rules and precision per pair. */
  symbols: '/v2/symbols',
} as const;

export type RestPathKey = keyof typeof REST_PATHS;

/**
 * Routes the proxy will forward, with the methods each accepts.
 * Anything absent is refused, so the proxy cannot be used as an open relay.
 *
 * Keyed by upstream path, so the proxy route needs no knowledge of which
 * endpoint names exist.
 */
export const PROXY_ROUTES: Readonly<Record<string, readonly string[]>> = {
  [REST_PATHS.publicToken]: ['POST'],
  [REST_PATHS.candles]: ['GET'],
  [REST_PATHS.orderBookSnapshot]: ['GET'],
  [REST_PATHS.orderBookFull]: ['GET'],
  [REST_PATHS.recentTrades]: ['GET'],
  [REST_PATHS.symbols]: ['GET'],
};

/** Maximum bars one candle request may return upstream. */
export const CANDLE_PAGE_LIMIT = 1500;

/** Default number of bars loaded for a fresh chart. */
export const DEFAULT_CANDLE_LIMIT = 1000;

/** Maximum book levels requested for the snapshot. */
export const ORDER_BOOK_DEPTH = 20;

// ==================== WebSocket topics ====================

/**
 * Wire interval identifiers. The UI never uses these strings directly; it
 * exchanges the `Timeframe` values above, and this mapping is the single
 * translation point.
 */
export const TIMEFRAME_MAP: Readonly<Record<Timeframe, string>> = {
  '1m': '1min',
  '3m': '3min',
  '15m': '15min',
  '30m': '30min',
  '1H': '1hour',
  '2H': '2hour',
  '4H': '4hour',
  '6H': '6hour',
  '8H': '8hour',
  '12H': '12hour',
  '1D': '1day',
  '1W': '1week',
};

/** Bar duration in seconds, used to size historical range requests. */
export const TIMEFRAME_SECONDS: Readonly<Record<Timeframe, number>> = {
  '1m': 60,
  '3m': 180,
  '15m': 900,
  '30m': 1800,
  '1H': 3600,
  '2H': 7200,
  '4H': 14400,
  '6H': 21600,
  '8H': 28800,
  '12H': 43200,
  '1D': 86400,
  '1W': 604800,
};

/** Upstream interval string for a UI timeframe. */
export function toWireInterval(timeframe: Timeframe): string {
  return TIMEFRAME_MAP[timeframe];
}

/** Map an upstream interval string back onto a UI timeframe. */
export function fromWireInterval(interval: string): Timeframe | undefined {
  const entry = (Object.keys(TIMEFRAME_MAP) as Timeframe[]).find(
    (key) => TIMEFRAME_MAP[key] === interval,
  );
  return entry;
}

/** WebSocket topic builders. */
export const WS_TOPICS = {
  candles: (symbol: Symbol, timeframe: Timeframe): string =>
    `/market/candles:${symbol}_${toWireInterval(timeframe)}`,
  orderBook: (symbol: Symbol): string => `/market/level2:${symbol}`,
  trades: (symbol: Symbol): string => `/market/match:${symbol}`,
} as const;

/**
 * Subjects carried by the topics above. Messages are routed on their subject
 * rather than their topic so a stale subscription cannot be mistaken for a
 * live one.
 */
export const WS_SUBJECTS = {
  candles: 'trade.candles.update',
  orderBook: 'trade.l2update',
  trades: 'trade.l3match',
} as const;
