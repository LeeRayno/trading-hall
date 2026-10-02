/**
 * Unified public WebSocket manager.
 *
 * Components never open sockets themselves. This class owns the single
 * connection for public market data and exposes domain-level subscriptions,
 * so the chart, the book and the trade tape share one socket and one
 * reconnection lifecycle.
 *
 * It also owns the bootstrap handshake: the endpoint is not a fixed URL but is
 * resolved from a short-lived public token, and the heartbeat intervals come
 * from the gateway the token advertises.
 */

import {
  UnifiedWSClient,
  WSStatus,
  type WebSocketFactory,
} from '../ws/UnifiedWSClient';
import type { WSFrame } from '../ws/protocol';
import {
  adaptCandleMessage,
  adaptOrderBookMessage,
  adaptTradeMessage,
} from './adapters/marketDataAdapter';
import type { MarketDataClient } from './client';
import { WS_TOPICS } from './endpoints';
import { marketDataProtocol } from './protocol';
import { ConnectionState } from './types';
import type {
  Candle,
  OrderBookUpdate,
  RecentTrade,
  Symbol,
  Timeframe,
  Unsubscribe,
} from './types';

export interface MarketDataWebSocketOptions {
  /** Used to bootstrap the token; the socket itself is opened separately. */
  client: MarketDataClient;
  /** Injectable socket implementation, for tests and non-browser hosts. */
  webSocketFactory?: WebSocketFactory;
  maxReconnectDelay?: number;
  debug?: boolean;
}

const STATUS_MAP: Readonly<Record<WSStatus, ConnectionState>> = {
  [WSStatus.CONNECTING]: ConnectionState.CONNECTING,
  [WSStatus.CONNECTED]: ConnectionState.CONNECTED,
  [WSStatus.RECONNECTING]: ConnectionState.RECONNECTING,
  [WSStatus.DISCONNECTED]: ConnectionState.DISCONNECTED,
  [WSStatus.CLOSED]: ConnectionState.CLOSED,
};

export class MarketDataWebSocket {
  private readonly client: MarketDataClient;
  private readonly transport: UnifiedWSClient;
  private readonly statusListeners = new Set<(state: ConnectionState) => void>();

  private started = false;
  /** Rotates gateways so a load-balancing disconnect lands somewhere new. */
  private instanceCursor = 0;
  private connectionState: ConnectionState = ConnectionState.IDLE;

  constructor(options: MarketDataWebSocketOptions) {
    this.client = options.client;

    this.transport = new UnifiedWSClient({
      // Resolved per connection attempt so an expired token is never reused.
      url: () => this.resolveEndpoint(),
      protocol: marketDataProtocol,
      autoConnect: false,
      // A live feed should keep trying for as long as the tab is open.
      maxReconnectAttempts: -1,
      reconnectBaseDelay: 1000,
      maxReconnectDelay: options.maxReconnectDelay ?? 30_000,
      webSocketFactory: options.webSocketFactory,
      debug: options.debug,
    });

    this.transport.onStatusChange((event) => {
      const { status } = event as { status: WSStatus };
      this.setConnectionState(STATUS_MAP[status] ?? ConnectionState.DISCONNECTED);
    });

    this.transport.onError((error) => {
      this.log('transport error', error);
    });

    // `error` control frames carry upstream diagnostics; keep them in logs.
    this.transport.onMessage((frame: WSFrame) => {
      if (frame.kind === 'control' && frame.type === 'error') {
        this.log('gateway error frame', frame.message);
      }
    });
  }

  // ==================== Lifecycle ====================

  /** Connect on demand; safe to call repeatedly. */
  public connect(): void {
    if (this.started && this.transport.isNormal()) return;
    this.started = true;
    this.transport.connect();
  }

  /** Tear the connection down and stop reconnecting. */
  public close(): void {
    this.started = false;
    this.transport.close();
  }

  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  public onConnectionStateChange(listener: (state: ConnectionState) => void): Unsubscribe {
    this.statusListeners.add(listener);
    listener(this.connectionState);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  // ==================== Domain subscriptions ====================

  /**
   * Stream live bars for a pair and timeframe.
   *
   * Returns an unsubscribe function. Callers must invoke it on cleanup so a
   * timeframe or symbol change does not leave the previous feed running.
   */
  public subscribeCandles(
    symbol: Symbol,
    timeframe: Timeframe,
    handler: (candle: Candle) => void,
  ): Unsubscribe {
    return this.subscribe(WS_TOPICS.candles(symbol, timeframe), (payload) => {
      const message = adaptCandleMessage(payload);
      if (!message) return;
      // A late frame from a previous symbol must never reach the chart.
      if (message.symbol !== symbol) return;
      handler(message.candle);
    });
  }

  /** Stream incremental book updates for a pair. */
  public subscribeOrderBook(
    symbol: Symbol,
    handler: (update: OrderBookUpdate) => void,
  ): Unsubscribe {
    return this.subscribe(WS_TOPICS.orderBook(symbol), (payload) => {
      const update = adaptOrderBookMessage(payload);
      if (update) handler(update);
    });
  }

  /** Stream public trade prints for a pair. */
  public subscribeTrades(symbol: Symbol, handler: (trade: RecentTrade) => void): Unsubscribe {
    return this.subscribe(WS_TOPICS.trades(symbol), (payload) => {
      const trade = adaptTradeMessage(payload);
      if (trade) handler(trade);
    });
  }

  // ==================== Internals ====================

  private subscribe(topic: string, deliver: (payload: unknown) => void): Unsubscribe {
    this.connect();

    const unsubscribe = this.transport.subscribe(topic, (frame) => {
      if (frame.kind !== 'data') return;
      deliver(frame.payload);
    });

    return () => {
      unsubscribe();
    };
  }

  /**
   * Resolve a dialable endpoint.
   *
   * Called before every connection attempt: the token is short-lived and the
   * advertised gateway list can change, so neither is cached across attempts.
   */
  private async resolveEndpoint(): Promise<string> {
    const grant = await this.client.getPublicToken();

    const instance = grant.instances[this.instanceCursor % grant.instances.length];
    this.instanceCursor += 1;

    // Heartbeat timings are dictated by the gateway, not chosen by us.
    this.transport.configureHeartbeat({
      pingInterval: instance.pingInterval,
      pingTimeout: instance.pingTimeout,
    });

    // A per-connection identifier the gateway expects in the query string.
    // This is the only randomness in the market data layer, and it never
    // reaches the UI: no candle, book level or trade is ever synthesised.
    const connectId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const query = new URLSearchParams({ token: grant.token, connectId });
    return `${instance.endpoint}?${query.toString()}`;
  }

  private setConnectionState(state: ConnectionState): void {
    if (this.connectionState === state) return;
    this.connectionState = state;
    for (const listener of this.statusListeners) {
      try {
        listener(state);
      } catch (error) {
        this.log('status listener threw', error);
      }
    }
  }

  private log(...args: unknown[]): void {
    console.warn('[MarketData]', ...args);
  }
}
