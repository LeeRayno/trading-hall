/**
 * The client the rest of the application depends on.
 *
 * It is a thin facade: it owns the transport configuration and names the
 * operations, while `trading.ts` owns the endpoints and `http/service.ts`
 * owns the wire. Its real job is to be the seam where a base URL or a `fetch`
 * implementation can be injected, which is what the server-side and
 * verification paths use.
 *
 * Requests go to the configured API base, which defaults to the same-origin
 * proxy because the public upstream sends no CORS headers.
 */

import { API_BASE_URL } from '../../config/api';
import { createHttpClient, type HttpClient } from '../http/service';
import * as trading from './trading';
import type { WebSocketGrant } from './adapters/marketDataAdapter';
import type {
  Candle,
  CandleQuery,
  OrderBook,
  RecentTrade,
  Symbol,
  SymbolInfo,
  Ticker,
} from './types';

export interface MarketDataClientOptions {
  /**
   * Base prepended verbatim to every path, including any API prefix. Defaults
   * to the configured client base, which already accounts for the prefix.
   */
  baseUrl?: string;
  /** Injectable for tests and for server-side use. */
  fetchImpl?: typeof fetch;
  /** Per-request deadline in ms. */
  timeoutMs?: number;
  /** Pre-built transport, which takes precedence over the fields above. */
  http?: HttpClient;
}

export class MarketDataClient {
  private readonly http: HttpClient;

  constructor(options: MarketDataClientOptions = {}) {
    this.http =
      options.http ??
      createHttpClient({
        baseUrl: options.baseUrl ?? API_BASE_URL,
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs,
      });
  }

  getPublicToken(signal?: AbortSignal): Promise<WebSocketGrant> {
    return trading.getPublicToken(this.http, signal);
  }

  getCandles(query: CandleQuery, signal?: AbortSignal): Promise<Candle[]> {
    return trading.getCandles(this.http, query, signal);
  }

  getOrderBookSnapshot(symbol: Symbol, signal?: AbortSignal): Promise<OrderBook> {
    return trading.getOrderBookSnapshot(this.http, symbol, signal);
  }

  getOrderBookFull(symbol: Symbol, signal?: AbortSignal): Promise<OrderBook> {
    return trading.getOrderBookFull(this.http, symbol, signal);
  }

  getRecentTrades(symbol: Symbol, signal?: AbortSignal): Promise<RecentTrade[]> {
    return trading.getRecentTrades(this.http, symbol, signal);
  }

  getSymbols(signal?: AbortSignal): Promise<SymbolInfo[]> {
    return trading.getSymbols(this.http, signal);
  }

  getTickers(signal?: AbortSignal): Promise<Ticker[]> {
    return trading.getTickers(this.http, signal);
  }
}
