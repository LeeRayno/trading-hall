/**
 * Raw upstream payload shapes.
 *
 * These types describe the wire format only. They must never escape the
 * adapter module: components and hooks consume the internal model instead.
 *
 * Shapes below were verified against live responses, with the notable quirks
 * recorded in each comment.
 */

/** Standard REST envelope. Success is `code === '200000'`. */
export interface RawEnvelope<T> {
  code: string;
  data: T | null;
  msg?: string;
}

/**
 * A candle row: `[time, open, close, high, low, volume, amount]`.
 *
 * Note the field order — close precedes high and low, which is easy to get
 * wrong. `time` is Unix **seconds** as a string.
 *
 * The list endpoint returns rows newest-first.
 */
export type RawCandle = [string, string, string, string, string, string, string] | string[];

/** Aggregated book snapshot. `time` is Unix **milliseconds**. */
export interface RawOrderBookSnapshot {
  time: number;
  sequence: string;
  bids: string[][];
  asks: string[][];
}

/** A public trade print. `time` is Unix **nanoseconds** as a string. */
export interface RawTrade {
  sequence: string;
  tradeId: string;
  price: string;
  size: string;
  side: string;
  time: string;
}

/** Trading rules for one pair. */
export interface RawSymbol {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  priceIncrement: string;
  baseIncrement: string;
  enableTrading: boolean;
}

/** One advertised WebSocket gateway. */
export interface RawInstanceServer {
  endpoint: string;
  encrypt: boolean;
  protocol: string;
  /** Server-driven heartbeat interval in ms. */
  pingInterval: number;
  /** Server-driven liveness deadline in ms. */
  pingTimeout: number;
}

/** Bootstrap payload carrying the short-lived public token. */
export interface RawPublicToken {
  token: string;
  instanceServers: RawInstanceServer[];
}

// ==================== WebSocket payloads ====================

/**
 * Candle push payload.
 *
 * `candles` holds a **single** candle row, not a list, despite the plural
 * name. `time` is Unix **nanoseconds** as a number.
 */
export interface RawCandleMessage {
  symbol: string;
  candles: string[];
  time: number;
}

/**
 * Book update payload.
 *
 * `changes.bids` / `changes.asks` are `[price, size, sequence]` triples.
 * A size of `"0"` removes the level.
 */
export interface RawOrderBookMessage {
  symbol: string;
  changes: {
    bids?: string[][];
    asks?: string[][];
  };
  sequenceStart: number;
  sequenceEnd: number;
  /** Unix **milliseconds**. */
  time: number;
}

/** Trade push payload; the fields mirror `RawTrade`. */
export interface RawTradeMessage {
  price: string;
  size: string;
  side: string;
  /** Unix **nanoseconds** as a string. */
  time: string;
  tradeId: string;
  sequence: string;
  symbol: string;
}
