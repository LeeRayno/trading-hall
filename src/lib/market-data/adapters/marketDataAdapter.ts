/**
 * Adapters: raw upstream payloads -> internal market data model.
 *
 * This is the only module allowed to know the upstream field order and unit
 * conventions. Components and hooks must never index into a raw payload.
 *
 * Every adapter is total: given anything at all it returns either a valid
 * domain object or `null`, so a single malformed record is dropped rather
 * than corrupting the rendered state.
 */

import {
  asArray,
  asRecord,
  isNonEmptyString,
  millisecondsToSeconds,
  nanosecondsToMilliseconds,
  secondsToMilliseconds,
  toFiniteNumber,
  toStringId,
  toTradeSide,
} from '../../utils/parse';
import { MarketDataError, MarketErrorCode } from '../errors';
import type {
  Candle,
  OrderBook,
  OrderBookLevel,
  OrderBookUpdate,
  RecentTrade,
  Symbol,
  SymbolInfo,
  SymbolSnapshot,
  Ticker,
} from '../types';
import type { RawSymbol } from './raw';

/** A resolved WebSocket grant: token plus reachable gateway instances. */
export interface WebSocketGrant {
  token: string;
  instances: {
    endpoint: string;
    pingInterval: number;
    pingTimeout: number;
  }[];
}

/** Upstream success code. */
const SUCCESS_CODE = '200000';

/**
 * Upstream rejection codes that mean "this pair is not tradable".
 *
 * An unknown pair is reported in two different ways depending on how far it
 * got through the upstream's own validation: a `200000` envelope carrying a
 * null payload, or this rejection with no payload at all. Both are permanent,
 * so both map to `INVALID_SYMBOL`. Folding the second into a generic upstream
 * failure would offer the user a retry that can never succeed.
 */
const UNKNOWN_SYMBOL_CODES: ReadonlySet<string> = new Set(['400100']);

/**
 * Validate a REST envelope and return its payload.
 *
 * A `200000` response with `data: null` is how an unknown symbol is reported,
 * so it maps to `INVALID_SYMBOL` rather than an empty result.
 */
export function unwrapEnvelope<T>(raw: unknown, context: string): T {
  const envelope = asRecord(raw);
  if (!envelope) {
    throw new MarketDataError(MarketErrorCode.INVALID_RESPONSE, `${context}: not an object`);
  }

  const code = envelope.code;
  if (typeof code === 'string' && code !== SUCCESS_CODE) {
    throw new MarketDataError(
      UNKNOWN_SYMBOL_CODES.has(code) ? MarketErrorCode.INVALID_SYMBOL : MarketErrorCode.UPSTREAM,
      `${context}: code ${code}`,
    );
  }

  if (envelope.data === null || envelope.data === undefined) {
    throw new MarketDataError(MarketErrorCode.INVALID_SYMBOL, `${context}: empty payload`);
  }

  return envelope.data as T;
}

// ==================== Candles ====================

/**
 * Parse one candle row.
 *
 * Row layout is `[time, open, close, high, low, volume, amount]`, where
 * `time` is Unix seconds.
 */
export function parseCandleRow(row: unknown): Candle | null {
  const cells = asArray(row);
  if (!cells || cells.length < 6) return null;

  const time = toFiniteNumber(cells[0]);
  const open = toFiniteNumber(cells[1]);
  const close = toFiniteNumber(cells[2]);
  const high = toFiniteNumber(cells[3]);
  const low = toFiniteNumber(cells[4]);
  const volume = toFiniteNumber(cells[5]);

  if (
    time === null ||
    open === null ||
    close === null ||
    high === null ||
    low === null ||
    volume === null
  ) {
    return null;
  }

  return { time, open, high, low, close, volume };
}

/**
 * Adapt a historical candle list into ascending time order.
 *
 * The upstream returns newest-first; charting libraries require oldest-first.
 * Duplicate timestamps keep the last occurrence, which is the most recent
 * revision of that bar.
 */
export function adaptCandles(raw: unknown): Candle[] {
  const rows = asArray(raw);
  if (!rows) return [];

  const byTime = new Map<number, Candle>();
  for (const row of rows) {
    const candle = parseCandleRow(row);
    if (candle) byTime.set(candle.time, candle);
  }

  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/** Adapt a candle push. Returns the symbol alongside the bar. */
export function adaptCandleMessage(payload: unknown): { symbol: string; candle: Candle } | null {
  const record = asRecord(payload);
  if (!record) return null;

  const symbol = record.symbol;
  if (!isNonEmptyString(symbol)) return null;

  const candle = parseCandleRow(record.candles);
  if (!candle) return null;

  return { symbol, candle };
}

// ==================== Order book ====================

/** Parse one `[price, size, ...]` level row. */
function parseLevelRow(row: unknown, allowZeroSize: boolean): OrderBookLevel | null {
  const cells = asArray(row);
  if (!cells || cells.length < 2) return null;

  const price = toFiniteNumber(cells[0]);
  const size = toFiniteNumber(cells[1]);
  if (price === null || size === null) return null;
  if (price <= 0) return null;
  if (size < 0) return null;
  if (!allowZeroSize && size === 0) return null;

  return { price, size };
}

function parseLevels(rows: unknown, allowZeroSize: boolean): OrderBookLevel[] {
  const list = asArray(rows);
  if (!list) return [];

  const byPrice = new Map<string, OrderBookLevel>();
  for (const row of list) {
    const level = parseLevelRow(row, allowZeroSize);
    if (level) byPrice.set(String(level.price), level);
  }
  return [...byPrice.values()];
}

/** Bids descend from the best bid; asks ascend from the best ask. */
function sortBook(bids: OrderBookLevel[], asks: OrderBookLevel[]): void {
  bids.sort((a, b) => b.price - a.price);
  asks.sort((a, b) => a.price - b.price);
}

/**
 * Adapt a book snapshot.
 *
 * Levels are re-sorted rather than trusted, so the UI can never display an
 * out-of-order book even if the upstream ordering changes.
 */
export function adaptOrderBookSnapshot(raw: unknown, depth?: number): OrderBook {
  const record = asRecord(raw);
  if (!record) {
    throw new MarketDataError(MarketErrorCode.INVALID_RESPONSE, 'order book: not an object');
  }

  // Zero-size levels are meaningless in a snapshot; in an update they mean
  // "remove this level", which is handled separately.
  const bids = parseLevels(record.bids, false);
  const asks = parseLevels(record.asks, false);
  sortBook(bids, asks);

  const sequence = toStringId(record.sequence) ?? '0';
  const timestamp = toFiniteNumber(record.time) ?? Date.now();

  return {
    bids: depth ? bids.slice(0, depth) : bids,
    asks: depth ? asks.slice(0, depth) : asks,
    sequence,
    timestamp,
  };
}

/**
 * Adapt a book increment.
 *
 * The upstream also stamps a sequence on every level; that per-level value is
 * deliberately dropped because gap detection is done on the update-level
 * `sequenceStart` / `sequenceEnd` pair, which is what the feed is ordered by.
 */
export function adaptOrderBookMessage(payload: unknown): OrderBookUpdate | null {
  const record = asRecord(payload);
  if (!record) return null;

  const changes = asRecord(record.changes);
  if (!changes) return null;

  const sequenceStart = toStringId(record.sequenceStart);
  const sequenceEnd = toStringId(record.sequenceEnd);
  if (!sequenceStart || !sequenceEnd) return null;

  return {
    bids: parseLevels(changes.bids, true),
    asks: parseLevels(changes.asks, true),
    sequenceStart,
    sequenceEnd,
    timestamp: toFiniteNumber(record.time) ?? Date.now(),
  };
}

// ==================== Recent trades ====================

/** Parse one trade record, whether from REST or the push feed. */
export function parseTradeRow(raw: unknown): RecentTrade | null {
  const record = asRecord(raw);
  if (!record) return null;

  const id = toStringId(record.tradeId);
  const price = toFiniteNumber(record.price);
  const size = toFiniteNumber(record.size);
  const side = toTradeSide(record.side);

  // `time` arrives in nanoseconds from both trade sources.
  const rawTime = toFiniteNumber(record.time);
  if (!id || price === null || size === null || !side || rawTime === null) return null;

  return {
    id,
    price,
    size,
    side,
    timestamp: nanosecondsToMilliseconds(rawTime),
  };
}

/**
 * Adapt a trade history list, newest first, de-duplicated by trade id.
 */
export function adaptRecentTrades(raw: unknown): RecentTrade[] {
  const rows = asArray(raw);
  if (!rows) return [];

  const byId = new Map<string, RecentTrade>();
  for (const row of rows) {
    const trade = parseTradeRow(row);
    if (trade) byId.set(trade.id, trade);
  }

  return [...byId.values()].sort((a, b) => b.timestamp - a.timestamp);
}

/** Adapt a single trade push. */
export function adaptTradeMessage(payload: unknown): RecentTrade | null {
  return parseTradeRow(payload);
}

// ==================== Tickers and quotes ====================

/**
 * Adapt the whole-market 24-hour statistics payload.
 *
 * The payload is an object carrying a `ticker` array, not the array itself
 * (unlike the trade history). Rows missing any field the ranking depends on
 * are dropped rather than defaulted: a pair whose volume is unknown would
 * otherwise sort as though it had none, or worse, as though it had the most.
 */
export function adaptAllTickers(raw: unknown): Ticker[] {
  const body = asRecord(raw);
  const rows = body ? asArray(body.ticker) : null;
  if (!rows) return [];

  const adapted: Ticker[] = [];
  for (const row of rows) {
    const ticker = adaptTickerRow(row);
    if (ticker) adapted.push(ticker);
  }
  return adapted;
}

function adaptTickerRow(raw: unknown): Ticker | null {
  const record = asRecord(raw);
  if (!record) return null;

  const symbol = record.symbol;
  const price = toFiniteNumber(record.last);
  const open = toFiniteNumber(record.open);
  const changeRate = toFiniteNumber(record.changeRate);
  // Quote volume, i.e. traded value in the quote currency, not the base amount
  // traded. Pairs are ranked against each other, and "500 BTC" and "500 SAND"
  // are not comparable while "500 USDT" is.
  const quoteVolume = toFiniteNumber(record.volValue);

  if (
    !isNonEmptyString(symbol) ||
    price === null ||
    open === null ||
    changeRate === null ||
    quoteVolume === null
  ) {
    return null;
  }

  return { symbol, price, open, changeRate, quoteVolume };
}

/**
 * Adapt a per-pair quote push.
 *
 * Two things set this feed apart from every other one here, and both fail
 * quietly if assumed away:
 *
 *   - The payload is nested a level deeper than the rest. The fields live
 *     under `payload.data`, not on the payload, so reading them off the top
 *     level returns `null` for every single frame — which is indistinguishable
 *     from a market that has simply gone quiet.
 *   - The frame names its own pair, and that name is checked rather than
 *     trusted. The fields around it are a trap for the eye: `baseCurrency` is
 *     the base only, and `market` says `USDS` for the market this app calls
 *     USDT. `symbol` is the field that means what the app means by it.
 *
 * The symbol is passed in because the subscription is what decided which pair
 * this frame is for, and the two should agree. A frame that names a different
 * pair than it was subscribed to is a misroute, and reporting it under the
 * subscribed name would put another pair's price on this row — so it is
 * dropped. A frame that names no pair at all still counts as this pair's.
 */
export function adaptSnapshotMessage(symbol: Symbol, payload: unknown): SymbolSnapshot | null {
  const frame = asRecord(payload);
  const record = frame ? asRecord(frame.data) : null;
  if (!record) return null;

  if (isNonEmptyString(record.symbol) && record.symbol !== symbol) return null;

  const price = toFiniteNumber(record.lastTradedPrice);
  const changeRate = toFiniteNumber(record.changeRate);
  const timestamp = toFiniteNumber(record.datetime);

  if (price === null || price <= 0 || changeRate === null || timestamp === null) return null;

  return { symbol, price, changeRate, timestamp };
}

// ==================== Symbols ====================

function adaptSymbol(raw: unknown): SymbolInfo | null {
  const record = asRecord(raw) as Partial<RawSymbol> | null;
  if (!record) return null;

  const { symbol, baseCurrency, quoteCurrency, priceIncrement, baseIncrement } = record;
  if (
    !isNonEmptyString(symbol) ||
    !isNonEmptyString(baseCurrency) ||
    !isNonEmptyString(quoteCurrency)
  ) {
    return null;
  }

  return {
    symbol,
    baseCurrency,
    quoteCurrency,
    priceIncrement: isNonEmptyString(priceIncrement) ? priceIncrement : '0.00000001',
    baseIncrement: isNonEmptyString(baseIncrement) ? baseIncrement : '0.00000001',
    enableTrading: record.enableTrading !== false,
  };
}

/** Adapt the tradable symbol list. */
export function adaptSymbols(raw: unknown): SymbolInfo[] {
  const rows = asArray(raw);
  if (!rows) return [];

  const adapted: SymbolInfo[] = [];
  for (const row of rows) {
    const info = adaptSymbol(row);
    if (info) adapted.push(info);
  }
  return adapted;
}

// ==================== WebSocket bootstrap ====================

/** Adapt the public token grant, keeping only gateways we can actually dial. */
export function adaptPublicToken(raw: unknown): WebSocketGrant {
  const record = asRecord(raw);
  const token = record?.token;
  if (!isNonEmptyString(token)) {
    throw new MarketDataError(MarketErrorCode.INVALID_RESPONSE, 'token grant: missing token');
  }

  const servers = asArray(record?.instanceServers) ?? [];
  const instances: WebSocketGrant['instances'] = [];

  for (const entry of servers) {
    const server = asRecord(entry);
    if (!server) continue;
    const endpoint = server.endpoint;
    if (!isNonEmptyString(endpoint)) continue;
    if (server.protocol !== 'websocket') continue;

    instances.push({
      endpoint,
      pingInterval: toFiniteNumber(server.pingInterval) ?? 15000,
      pingTimeout: toFiniteNumber(server.pingTimeout) ?? 5000,
    });
  }

  if (instances.length === 0) {
    throw new MarketDataError(MarketErrorCode.INVALID_RESPONSE, 'token grant: no gateway');
  }

  return { token, instances };
}

// ==================== Unit helpers re-exported for tests ====================

export {
  millisecondsToSeconds,
  nanosecondsToMilliseconds,
  secondsToMilliseconds,
};
