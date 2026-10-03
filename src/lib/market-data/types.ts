/**
 * Internal market data model.
 *
 * These types are the only shape the UI layer ever sees. Nothing here reveals
 * which upstream produced the data, and swapping providers must not require
 * touching components or hooks.
 *
 * Time units are stated explicitly on every timestamp to avoid the usual
 * seconds/milliseconds drift. Adapters are responsible for normalising them.
 */

/** A spot trading pair, e.g. `BTC-USDT`. */
export type Symbol = string;

/** Chart intervals as presented to the user. */
export const TIMEFRAMES = [
  '1m',
  '3m',
  '15m',
  '30m',
  '1H',
  '2H',
  '4H',
  '6H',
  '8H',
  '12H',
  '1D',
  '1W',
] as const;

export type Timeframe = (typeof TIMEFRAMES)[number];

export type TradeSide = 'buy' | 'sell';

/** A single OHLCV bar. */
export interface Candle {
  /** Bar open time, Unix **seconds** (chart-library convention). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** One price level of the book. */
export interface OrderBookLevel {
  price: number;
  size: number;
}

/** A consistent book snapshot. */
export interface OrderBook {
  /** Bids sorted by price descending (best bid first). */
  bids: OrderBookLevel[];
  /** Asks sorted by price ascending (best ask first). */
  asks: OrderBookLevel[];
  /** Provider sequence the snapshot corresponds to. */
  sequence: string;
  /** Snapshot time, Unix **milliseconds**. */
  timestamp: number;
}

/** An incremental book change. `size === 0` means the level was removed. */
export interface OrderBookUpdate {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  sequenceStart: string;
  sequenceEnd: string;
  /** Update time, Unix **milliseconds**. */
  timestamp: number;
}

/** A public match/trade print. */
export interface RecentTrade {
  id: string;
  price: number;
  size: number;
  /** Taker side: the aggressor of the match. */
  side: TradeSide;
  /** Match time, Unix **milliseconds**. */
  timestamp: number;
}

/** Trading rules and precision for one pair. */
export interface SymbolInfo {
  symbol: Symbol;
  baseCurrency: string;
  quoteCurrency: string;
  /** Price step, e.g. `0.0001`. Used to derive display precision. */
  priceIncrement: string;
  /** Size step, e.g. `0.00000001`. Used to derive display precision. */
  baseIncrement: string;
  enableTrading: boolean;
}

/**
 * 24-hour statistics for one pair, as the market list reports them.
 *
 * Used to rank pairs rather than to display a live price: it is a whole-market
 * snapshot, so it is read once and is stale by the time it arrives.
 */
export interface Ticker {
  symbol: Symbol;
  /** Last traded price. */
  price: number;
  /** Price 24 hours ago; the baseline the change is measured against. */
  open: number;
  /** Fraction, not percent: `-0.0202` is a 2.02% fall. */
  changeRate: number;
  /** Traded value over 24h in quote currency, e.g. USDT. */
  quoteVolume: number;
}

/**
 * A live per-pair quote, as the snapshot feed pushes it.
 *
 * Unlike the ticker above, the change rate here is the provider's own and is
 * not derived: the feed carries it alongside the price, so a displayed
 * percentage is never a locally computed approximation of one.
 */
export interface SymbolSnapshot {
  symbol: Symbol;
  /** Last traded price. */
  price: number;
  /** Fraction, not percent: `-0.0202` is a 2.02% fall. */
  changeRate: number;
  /** Quote time, Unix **milliseconds**. */
  timestamp: number;
}

/** Coarse connection state exposed to the UI. */
export const ConnectionState = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  DISCONNECTED: 'disconnected',
  CLOSED: 'closed',
} as const;

export type ConnectionState = (typeof ConnectionState)[keyof typeof ConnectionState];

/** Query for historical bars. */
export interface CandleQuery {
  symbol: Symbol;
  timeframe: Timeframe;
  /** Inclusive range bounds, Unix **seconds**. Omit for "most recent". */
  startAt?: number;
  endAt?: number;
  /** Desired bar count; the provider clamps this to its own page limit. */
  limit?: number;
}

/** Callback receiving a fully adapted domain object. */
export type Unsubscribe = () => void;
