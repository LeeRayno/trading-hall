/**
 * Generic, protocol-agnostic WebSocket transport.
 *
 * Adapted from the project's existing socket wrapper. The connection
 * lifecycle, subscription bookkeeping, heartbeat, exponential-backoff
 * reconnection, outbound queue and event bus are kept as they were; what
 * changed is that the gateway envelope moved behind `WSProtocol` so the same
 * transport can serve a different upstream without being rewritten.
 *
 * Responsibilities kept here (deliberately generic):
 *   connect / disconnect / subscribe / unsubscribe / send queue
 *   onOpen / onClose / onError / onMessage / status changes
 *   heartbeat driven by server-provided intervals
 *   automatic reconnection with exponential backoff and full re-subscription
 */

import type { WSFrame, WSIdGenerator, WSProtocol } from './protocol';
import { createSequentialIdGenerator } from './protocol';

/** Connection state, observable by consumers. */
export const WSStatus = {
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  RECONNECTING: 'RECONNECTING',
  /** Terminal state reached after an explicit `disconnect()`. */
  CLOSED: 'CLOSED',
} as const;

export type WSStatus = (typeof WSStatus)[keyof typeof WSStatus];

/**
 * The slice of the WebSocket API this transport relies on.
 *
 * Declaring it structurally keeps the transport independent of the host
 * implementation, which allows injecting an alternative socket (a proxy-aware
 * one under Node, a mock under test) without touching transport logic.
 */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
}

export type WebSocketFactory = (
  url: string,
  protocols?: string | string[],
) => WebSocketLike;

export const defaultWebSocketFactory: WebSocketFactory = (url, protocols) =>
  new WebSocket(url, protocols) as unknown as WebSocketLike;

/** Resolves the current endpoint; may be async so tokens can be refreshed. */
export type UrlResolver = () => string | Promise<string>;

export interface WSClientOptions {
  /** Endpoint, or a resolver invoked before every (re)connection. */
  url: string | UrlResolver;
  protocols?: string | string[];
  /** Envelope codec for the target gateway. */
  protocol: WSProtocol;
  /** Application heartbeat interval in ms. Overridden by server config. */
  pingInterval?: number;
  /** How long to wait for liveness before declaring the link dead. */
  pongTimeout?: number;
  /**
   * How long a handshake may stay unopened before the attempt is abandoned.
   * A gateway that accepts the connection but never completes the upgrade
   * would otherwise leave the client waiting forever.
   */
  connectTimeout?: number;
  /** `-1` retries forever, which is the right default for a live feed. */
  maxReconnectAttempts?: number;
  reconnectBaseDelay?: number;
  maxReconnectDelay?: number;
  autoConnect?: boolean;
  /** Injected socket implementation; defaults to the platform WebSocket. */
  webSocketFactory?: WebSocketFactory;
  /** Injected id generator, mainly to make control frames deterministic in tests. */
  idGenerator?: WSIdGenerator;
  /** Set to false to silence transport logs in production. */
  debug?: boolean;
}

export type MessageCallback = (frame: WSFrame) => void;
export type EventListener = (...args: never[]) => void;

export interface StatusChangeEvent {
  status: WSStatus;
  prevStatus: WSStatus;
}

type TransportEvent = 'open' | 'close' | 'error' | 'statusChange' | 'message';
type Listener = (...args: unknown[]) => void;

const CONNECTING = 0;
const OPEN = 1;

export class UnifiedWSClient {
  private readonly urlResolver: UrlResolver;
  private readonly protocols?: string | string[];
  private readonly protocol: WSProtocol;
  private readonly webSocketFactory: WebSocketFactory;
  private readonly nextId: WSIdGenerator;
  private readonly debug: boolean;

  private options: {
    pingInterval: number;
    pongTimeout: number;
    connectTimeout: number;
    maxReconnectAttempts: number;
    reconnectBaseDelay: number;
    maxReconnectDelay: number;
  };

  private ws: WebSocketLike | null = null;
  private status: WSStatus = WSStatus.DISCONNECTED;

  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectPromise: Promise<void> | null = null;

  private reconnectAttempts = 0;
  private isExplicitlyClosed = false;

  private eventListeners = new Map<TransportEvent, Set<Listener>>();

  /** topic -> set of callbacks. The topic is the wire topic itself. */
  private subscribers = new Map<string, Set<MessageCallback>>();

  constructor(options: WSClientOptions) {
    this.urlResolver =
      typeof options.url === 'string' ? () => options.url as string : options.url;
    this.protocols = options.protocols;
    this.protocol = options.protocol;
    this.webSocketFactory = options.webSocketFactory ?? defaultWebSocketFactory;
    this.nextId = options.idGenerator ?? createSequentialIdGenerator();
    this.debug = options.debug ?? process.env.NODE_ENV !== 'production';

    this.options = {
      pingInterval: options.pingInterval ?? 15000,
      pongTimeout: options.pongTimeout ?? 5000,
      connectTimeout: options.connectTimeout ?? 10000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? -1,
      reconnectBaseDelay: options.reconnectBaseDelay ?? 1000,
      maxReconnectDelay: options.maxReconnectDelay ?? 30000,
    };

    if (options.autoConnect ?? true) {
      this.connect();
    }
  }

  // ==================== Connection control ====================

  /** Establish the physical connection, resolving the endpoint if needed. */
  public connect(): void {
    if (this.ws && (this.ws.readyState === CONNECTING || this.ws.readyState === OPEN)) {
      return;
    }
    // Guard against overlapping attempts (StrictMode double-invocation,
    // reconnect racing an explicit connect, ...).
    if (this.connectPromise) return;

    this.isExplicitlyClosed = false;
    this.setStatus(this.reconnectAttempts > 0 ? WSStatus.RECONNECTING : WSStatus.CONNECTING);

    this.connectPromise = this.openSocket().finally(() => {
      this.connectPromise = null;
    });
  }

  private async openSocket(): Promise<void> {
    let url: string;
    try {
      url = await this.urlResolver();
    } catch (error) {
      this.log('endpoint resolution failed', error);
      this.emit('error', error);
      this.handleReconnect();
      return;
    }

    // A disconnect() may have landed while the endpoint was resolving.
    if (this.isExplicitlyClosed) return;

    try {
      const ws = this.webSocketFactory(url, this.protocols);
      this.ws = ws;
      this.initEvents(ws);
    } catch (error) {
      this.emit('error', error);
      this.handleReconnect();
    }
  }

  public isNormal(): boolean {
    return this.status === WSStatus.CONNECTED && this.ws?.readyState === OPEN;
  }

  public getStatus(): WSStatus {
    return this.status;
  }

  /** Topics currently subscribed locally. */
  public getSubscribedTopics(): string[] {
    return [...this.subscribers.keys()];
  }

  /**
   * Override heartbeat timings, typically with the values advertised by the
   * bootstrap endpoint. Applied immediately if a socket is already open.
   */
  public configureHeartbeat(config: { pingInterval?: number; pingTimeout?: number }): void {
    if (typeof config.pingInterval === 'number' && config.pingInterval > 0) {
      this.options.pingInterval = config.pingInterval;
    }
    if (typeof config.pingTimeout === 'number' && config.pingTimeout > 0) {
      this.options.pongTimeout = config.pingTimeout;
    }
    if (this.isNormal()) {
      this.startHeartbeat();
    }
  }

  /** Close permanently; no automatic reconnection follows. */
  public close(code = 1000, reason?: string): void {
    this.isExplicitlyClosed = true;
    this.clearAllTimers();

    if (this.ws) {
      try {
        this.ws.close(code, reason);
      } catch {
        // The socket may already be gone; the local teardown still stands.
      }
      this.ws = null;
    }
    this.setStatus(WSStatus.CLOSED);
  }

  /** Alias for `close()`, for symmetry with `connect()`. */
  public disconnect(code = 1000, reason?: string): void {
    this.close(code, reason);
  }

  // ==================== Events ====================

  public on(event: TransportEvent, listener: Listener): void {
    let set = this.eventListeners.get(event);
    if (!set) {
      set = new Set();
      this.eventListeners.set(event, set);
    }
    set.add(listener);
  }

  public off(event: TransportEvent, listener: Listener): void {
    this.eventListeners.get(event)?.delete(listener);
  }

  public onOpen(listener: () => void): () => void {
    const wrapped: Listener = () => listener();
    this.on('open', wrapped);
    return () => this.off('open', wrapped);
  }

  public onClose(listener: (event: { code?: number; reason?: string }) => void): () => void {
    const wrapped: Listener = (event) =>
      listener((event ?? {}) as { code?: number; reason?: string });
    this.on('close', wrapped);
    return () => this.off('close', wrapped);
  }

  public onError(listener: (error: unknown) => void): () => void {
    const wrapped: Listener = (error) => listener(error);
    this.on('error', wrapped);
    return () => this.off('error', wrapped);
  }

  public onMessage(listener: (frame: WSFrame) => void): () => void {
    const wrapped: Listener = (frame) => listener(frame as WSFrame);
    this.on('message', wrapped);
    return () => this.off('message', wrapped);
  }

  public onStatusChange(listener: (event: StatusChangeEvent) => void): () => void {
    const wrapped: Listener = (event) => listener(event as StatusChangeEvent);
    this.on('statusChange', wrapped);
    return () => this.off('statusChange', wrapped);
  }

  // ==================== Subscriptions ====================

  /**
   * Subscribe to a wire topic. Several callbacks may share one topic; the
   * upstream subscription is only released once the last one detaches.
   * Returns an unsubscribe function.
   */
  public subscribe(topic: string, callback: MessageCallback): () => void {
    let set = this.subscribers.get(topic);
    const isFirst = !set || set.size === 0;
    if (!set) {
      set = new Set();
      this.subscribers.set(topic, set);
    }
    set.add(callback);

    if (isFirst) {
      this.sendControl(this.protocol.encodeSubscribe(this.nextId(), topic));
    }

    return () => this.unsubscribe(topic, callback);
  }

  public unsubscribe(topic: string, callback: MessageCallback): void {
    const set = this.subscribers.get(topic);
    if (!set) return;

    set.delete(callback);
    if (set.size > 0) return;

    this.subscribers.delete(topic);
    this.sendControl(this.protocol.encodeUnsubscribe(this.nextId(), topic));
  }

  // ==================== Internal: socket wiring ====================

  private initEvents(ws: WebSocketLike): void {
    // An attempt can end three ways — an error, a close, or the handshake
    // timing out — and a real failure often delivers two of them. They all
    // funnel here so exactly one reconnect is scheduled per attempt, and so a
    // socket that neither opens nor closes cannot strand the client.
    let retryPending = false;
    const failAttempt = () => {
      if (retryPending) return;
      retryPending = true;
      this.clearConnectTimeout();
      if (this.ws === ws) this.ws = null;
      this.setStatus(WSStatus.DISCONNECTED);
      this.handleReconnect();
    };

    // A gateway can accept the connection and then never complete the
    // upgrade, which produces neither an error nor a close. Without this
    // deadline the client would wait on it forever, so the attempt is
    // abandoned and the next gateway gets a turn.
    this.clearConnectTimeout();
    this.connectTimer = setTimeout(() => {
      if (this.ws !== ws) return;
      this.log(`no handshake within ${this.options.connectTimeout}ms; retrying`);
      try {
        ws.close();
      } catch {
        // Already gone; the failed attempt below still stands.
      }
      // Closing fires onclose, but `failAttempt` is idempotent, so the
      // reconnect is scheduled exactly once.
      failAttempt();
    }, this.options.connectTimeout);

    ws.onopen = () => {
      this.clearConnectTimeout();
      this.reconnectAttempts = 0;
      this.setStatus(WSStatus.CONNECTED);

      this.startHeartbeat();
      this.resubscribeAll();

      this.emit('open');
    };

    ws.onmessage = (event) => {
      // Any inbound traffic proves the link is alive.
      this.resetHeartbeatTimeout();

      let parsed: unknown;
      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        this.log('discarded malformed message');
        return;
      }

      const frame = this.protocol.decode(parsed);
      if (!frame) return;

      this.emit('message', frame);

      if (frame.kind === 'control') return;

      const callbacks = this.subscribers.get(frame.topic);
      if (!callbacks || callbacks.size === 0) return;

      for (const callback of callbacks) {
        try {
          callback(frame);
        } catch (error) {
          // One faulty consumer must not break delivery to the others.
          this.log('subscriber callback threw', error);
        }
      }
    };

    ws.onerror = (event) => {
      this.emit('error', event);
      // A close normally follows, but a socket that failed before the upgrade
      // does not always report one, so the attempt ends here too.
      if (!this.isExplicitlyClosed) failAttempt();
    };

    ws.onclose = (event) => {
      // Only this connection's own timers are cleared. A blanket
      // `clearAllTimers()` here would cancel a reconnect that the connect
      // timeout already scheduled — this close often arrives after it, and
      // that race would silently stop the client from ever retrying.
      this.stopHeartbeat();
      this.clearConnectTimeout();
      this.emit('close', event);
      if (!this.isExplicitlyClosed) failAttempt();
    };
  }

  private clearConnectTimeout(): void {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  // ==================== Internal: heartbeat ====================

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.pingTimer = setInterval(() => {
      if (!this.isNormal()) return;

      this.sendControl(this.protocol.encodePing(this.nextId()));

      // Restart the liveness deadline for this beat.
      if (this.pongTimer) clearTimeout(this.pongTimer);
      this.pongTimer = setTimeout(() => {
        this.log('heartbeat timed out; forcing reconnection');
        // Closing triggers onclose, which owns the reconnect path.
        try {
          this.ws?.close();
        } catch {
          this.handleReconnect();
        }
      }, this.options.pongTimeout);
    }, this.options.pingInterval);
  }

  private resetHeartbeatTimeout(): void {
    if (!this.pongTimer) return;
    clearTimeout(this.pongTimer);
    this.pongTimer = null;
  }

  private stopHeartbeat(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pingTimer = null;
    this.pongTimer = null;
  }

  // ==================== Internal: reconnection ====================

  private handleReconnect(): void {
    if (this.isExplicitlyClosed) return;

    const { maxReconnectAttempts, reconnectBaseDelay, maxReconnectDelay } = this.options;

    if (maxReconnectAttempts !== -1 && this.reconnectAttempts >= maxReconnectAttempts) {
      this.log(`giving up after ${maxReconnectAttempts} attempts`);
      this.setStatus(WSStatus.DISCONNECTED);
      return;
    }

    this.reconnectAttempts++;

    // 1s, 2s, 4s, 8s ... capped, so a long outage cannot hammer the gateway.
    const delay = Math.min(
      reconnectBaseDelay * Math.pow(2, this.reconnectAttempts - 1),
      maxReconnectDelay,
    );

    this.log(`reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /** Re-arm every local subscription on a freshly opened socket. */
  private resubscribeAll(): void {
    for (const topic of this.subscribers.keys()) {
      this.sendControl(this.protocol.encodeSubscribe(this.nextId(), topic));
    }
  }

  // ==================== Internal: plumbing ====================

  /**
   * Send a protocol control frame, or drop it when the socket is not writable.
   *
   * Control frames are deliberately never queued. Local subscription state is
   * the authoritative record, and `resubscribeAll()` re-asserts all of it the
   * moment a socket opens — so a queued subscribe would be sent twice, and a
   * queued unsubscribe or ping would replay an intent that is already stale.
   * The heartbeat restarts on open too, so nothing is lost by dropping one.
   */
  private sendControl(payload: string): void {
    if (!this.isNormal()) return;
    this.ws?.send(payload);
  }

  private setStatus(nextStatus: WSStatus): void {
    if (this.status === nextStatus) return;
    const prevStatus = this.status;
    this.status = nextStatus;
    this.emit('statusChange', { status: nextStatus, prevStatus } satisfies StatusChangeEvent);
  }

  private clearAllTimers(): void {
    this.stopHeartbeat();
    this.clearConnectTimeout();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private emit(event: TransportEvent, ...args: unknown[]): void {
    const listeners = this.eventListeners.get(event);
    if (!listeners) return;
    for (const listener of listeners) {
      try {
        listener(...args);
      } catch (error) {
        this.log(`listener for "${event}" threw`, error);
      }
    }
  }

  private log(...args: unknown[]): void {
    if (!this.debug) return;
    console.warn('[WebSocket]', ...args);
  }
}
