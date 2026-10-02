// UnifiedWSClient.ts

// 1. 连接状态枚举（供外部感知）
export enum WSStatus {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  RECONNECTING = 'RECONNECTING',
  CLOSED = 'CLOSED', // 主动调用 close() 后的终态，不再自动重连
}

// 2. 网关标准通信协议（信封结构 Envelope）
export interface WSRequest {
  action: 'SUBSCRIBE' | 'UNSUBSCRIBE' | 'SEND' | 'PING';
  channel: string;          // 一级通道 (如 'chat', 'order', 'ticker')
  topics?: string[];        // 二级主题/标的，可选 (如 ['BTC-USDT', 'ETH-USDT'])
  event?: string;           // 业务行为/事件，可选 (如 'send_message')
  data?: any;               // 真正的业务数据
}

export interface WSResponse<T = any> {
  channel: string;          // 一级通道
  topic?: string;           // 二级主题/标的 (如果有)
  event?: string;           // 业务事件
  data: T;                  // 响应数据
  timestamp?: number;
}

// 3. 配置参数接口
export interface WSClientOptions {
  url: string | (() => string); // 支持动态 URL (解决 Token 刷新的问题)
  protocols?: string | string[];
  pingInterval?: number;         // 心跳发送间隔 (默认 15000ms)
  pongTimeout?: number;          // 心跳超时判定时间 (默认 5000ms)
  maxReconnectAttempts?: number;// 最大重连次数 (默认 10 次，-1 为无限重连)
  reconnectBaseDelay?: number;  // 重连基础延迟 (默认 1000ms)
  maxReconnectDelay?: number;   // 重连最大延迟 (默认 30000ms)
  autoConnect?: boolean;        // 是否自动连接 (默认 true)
}

export type MessageCallback = (data: any, rawMessage: WSResponse) => void;
export type EventListener = (...args: any[]) => void;

export class UnifiedWSClient {
  private urlGetter: () => string;
  private protocols?: string | string[];
  private options: Required<Omit<WSClientOptions, 'url' | 'protocols'>>;

  private ws: WebSocket | null = null;
  private status: WSStatus = WSStatus.DISCONNECTED;

  // 定时器
  private pingTimer: any = null;
  private pongTimer: any = null;
  private reconnectTimer: any = null;

  // 重连控制
  private reconnectAttempts = 0;
  private isExplicitlyClosed = false;

  // 消息发送队列（连接断开或未准备好时暂存）
  private messageQueue: Array<string | ArrayBufferLike | Blob | ArrayBufferView> = [];

  // 通用事件发布订阅 (内部状态变化通知: open, close, error, statusChange)
  private eventListeners: Map<string, Set<EventListener>> = new Map();

  // 业务订阅树: RouteKey ("channel" 或 "channel:topic") -> Set<MessageCallback>
  private subscribers: Map<string, Set<MessageCallback>> = new Map();

  constructor(options: WSClientOptions) {
    this.urlGetter = typeof options.url === 'function' ? options.url : () => options.url;
    this.protocols = options.protocols;

    this.options = {
      pingInterval: options.pingInterval ?? 15000,
      pongTimeout: options.pongTimeout ?? 5000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
      reconnectBaseDelay: options.reconnectBaseDelay ?? 1000,
      maxReconnectDelay: options.maxReconnectDelay ?? 30000,
      autoConnect: options.autoConnect ?? true,
    };

    if (this.options.autoConnect) {
      this.connect();
    }
  }

  // ==================== 1. 核心连接控制与状态感知 ====================

  /**
   * 建立底层物理连接
   */
  public connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isExplicitlyClosed = false;
    this.setStatus(this.reconnectAttempts > 0 ? WSStatus.RECONNECTING : WSStatus.CONNECTING);

    try {
      const url = this.urlGetter();
      this.ws = new WebSocket(url, this.protocols);
      this.initEvents();
    } catch (error) {
      this.emit('error', error);
      this.handleReconnect();
    }
  }

  /**
   * 外部判断连接是否正常
   */
  public isNormal(): boolean {
    return this.status === WSStatus.CONNECTED && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * 获取当前详细状态
   */
  public getStatus(): WSStatus {
    return this.status;
  }

  /**
   * 主动关闭连接（不触发自动重连）
   */
  public close(code: number = 1000, reason?: string) {
    this.isExplicitlyClosed = true;
    this.clearAllTimers();
    this.messageQueue = [];

    if (this.ws) {
      this.ws.close(code, reason);
      this.ws = null;
    }
    this.setStatus(WSStatus.CLOSED);
  }

  /**
   * 监听底层状态变更事件
   */
  public on(event: 'open' | 'close' | 'error' | 'statusChange', listener: EventListener) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  public off(event: string, listener: EventListener) {
    this.eventListeners.get(event)?.delete(listener);
  }

  // ==================== 2. 统一业务订阅与发送 API ====================

  /**
   * 融合订阅 API（callback 固定为第二个参数，topics 作为第三个可选参数）
   * 示例 1 (无 Topic): ws.subscribe('chat', callback)
   * 示例 2 (单 Topic): ws.subscribe('ticker', callback, 'BTC-USDT')
   * 示例 3 (多 Topic): ws.subscribe('ticker', callback, ['BTC-USDT', 'ETH-USDT'])
   */
  public subscribe(
    channel: string,
    callback: MessageCallback,
    topics?: string | string[]
  ): () => void {
    const topicList = topics ? (Array.isArray(topics) ? topics : [topics]) : [];

    // 1. 无 Topic 的场景 (如 chat, order)
    if (topicList.length === 0) {
      const isFirst = this.addSubscription(channel, callback);
      if (isFirst) {
        this.sendGatewayAction('SUBSCRIBE', channel);
      }
    } 
    // 2. 有 Topic 的场景 (如 ticker: BTC-USDT, ETH-USDT)
    else {
      const newTopicsToSubscribe: string[] = [];
      topicList.forEach((topic) => {
        const routeKey = `${channel}:${topic}`;
        const isFirst = this.addSubscription(routeKey, callback);
        if (isFirst) {
          newTopicsToSubscribe.push(topic);
        }
      });

      if (newTopicsToSubscribe.length > 0) {
        this.sendGatewayAction('SUBSCRIBE', channel, newTopicsToSubscribe);
      }
    }

    // 返回取消订阅的函数，便于组件卸载时直接调用
    return () => this.unsubscribe(channel, callback, topics);
  }

  /**
   * 取消订阅 API
   */
  public unsubscribe(
    channel: string,
    callback: MessageCallback,
    topics?: string | string[]
  ) {
    const topicList = topics ? (Array.isArray(topics) ? topics : [topics]) : [];

    if (topicList.length === 0) {
      const hasRemaining = this.removeSubscription(channel, callback);
      if (!hasRemaining) {
        this.sendGatewayAction('UNSUBSCRIBE', channel);
      }
    } else {
      const topicsToUnsubscribe: string[] = [];
      topicList.forEach((topic) => {
        const routeKey = `${channel}:${topic}`;
        const hasRemaining = this.removeSubscription(routeKey, callback);
        if (!hasRemaining) {
          topicsToUnsubscribe.push(topic);
        }
      });

      if (topicsToUnsubscribe.length > 0) {
        this.sendGatewayAction('UNSUBSCRIBE', channel, topicsToUnsubscribe);
      }
    }
  }

  /**
   * 业务消息发送（若连接未准备好，会自动缓存进入发送队列）
   */
  public send(channel: string, data: any, event?: string, topic?: string) {
    const payload: WSRequest = {
      action: 'SEND',
      channel,
      event,
      data,
      topics: topic ? [topic] : undefined,
    };

    this.sendRaw(JSON.stringify(payload));
  }

  // ==================== 3. 内部事件绑定与分发 ====================

  private initEvents() {
    if (!this.ws) return;

    this.ws.onopen = (event) => {
      this.reconnectAttempts = 0;
      this.setStatus(WSStatus.CONNECTED);
      
      this.startHeartbeat();     // 启动心跳
      this.flushMessageQueue();  // 补发缓存消息
      this.resubscribeAll();     // 重新挂载全量业务订阅

      this.emit('open', event);
    };

    this.ws.onmessage = (event) => {
      // 收到任何服务端数据，重置心跳倒计时
      this.resetHeartbeatTimeout();

      try {
        const message: WSResponse = JSON.parse(event.data);

        // A. 心跳 Pong 回应检查
        if (message.channel === 'system' && message.event === 'pong') {
          return;
        }

        // B. 业务消息路由分发
        const { channel, topic } = message;
        const routeKey = topic ? `${channel}:${topic}` : channel;

        const callbacks = this.subscribers.get(routeKey);
        if (callbacks && callbacks.size > 0) {
          callbacks.forEach((cb) => cb(message.data, message));
        }
      } catch (err) {
        console.error('[UnifiedWS] 消息解析或路由异常:', err);
      }
    };

    this.ws.onerror = (event) => {
      this.emit('error', event);
    };

    this.ws.onclose = (event) => {
      this.clearAllTimers();
      this.ws = null;
      this.emit('close', event);

      // 非主动关闭则启动自动重连机制
      if (!this.isExplicitlyClosed) {
        this.setStatus(WSStatus.DISCONNECTED);
        this.handleReconnect();
      }
    };
  }

  // ==================== 4. 心跳保活机制 ====================

  private startHeartbeat() {
    this.stopHeartbeat();

    this.pingTimer = setInterval(() => {
      if (this.isNormal()) {
        // 向网关发送系统级心跳
        this.sendRaw(JSON.stringify({ action: 'PING', channel: 'system', event: 'ping' }));

        // 启动 Pong 超时限制
        this.pongTimer = setTimeout(() => {
          console.warn('[UnifiedWS] 心跳响应 Timeout，判定连接断开，触发重新连接');
          this.ws?.close(); // 触发 onclose 进入重连流程
        }, this.options.pongTimeout);
      }
    }, this.options.pingInterval);
  }

  private resetHeartbeatTimeout() {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private stopHeartbeat() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pingTimer = null;
    this.pongTimer = null;
  }

  // ==================== 5. 断线重连（指数退避算法） ====================

  private handleReconnect() {
    if (this.isExplicitlyClosed) return;

    const { maxReconnectAttempts, reconnectBaseDelay, maxReconnectDelay } = this.options;

    if (maxReconnectAttempts !== -1 && this.reconnectAttempts >= maxReconnectAttempts) {
      console.error(`[UnifiedWS] 已达最大重连次数 (${maxReconnectAttempts})，停止自动重连`);
      this.setStatus(WSStatus.DISCONNECTED);
      return;
    }

    this.reconnectAttempts++;

    // 指数退避算法: 1s, 2s, 4s, 8s ... Max 30s
    const delay = Math.min(
      reconnectBaseDelay * Math.pow(2, this.reconnectAttempts - 1),
      maxReconnectDelay
    );

    console.log(`[UnifiedWS] 将在 ${delay}ms 后进行第 ${this.reconnectAttempts} 次重连...`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  // 连上后，重新向服务端恢复原有的全量订阅通道
  private resubscribeAll() {
    const channelTopicMap = new Map<string, string[]>();

    this.subscribers.forEach((_, routeKey) => {
      const [channel, topic] = routeKey.split(':');
      if (!channelTopicMap.has(channel)) {
        channelTopicMap.set(channel, []);
      }
      if (topic) {
        channelTopicMap.get(channel)!.push(topic);
      }
    });

    channelTopicMap.forEach((topics, channel) => {
      this.sendGatewayAction('SUBSCRIBE', channel, topics.length > 0 ? topics : undefined);
    });
  }

  // ==================== 6. 基础设施与辅助方法 ====================

  private addSubscription(routeKey: string, cb: MessageCallback): boolean {
    if (!this.subscribers.has(routeKey)) {
      this.subscribers.set(routeKey, new Set());
    }
    const set = this.subscribers.get(routeKey)!;
    const isFirst = set.size === 0;
    set.add(cb);
    return isFirst;
  }

  private removeSubscription(routeKey: string, cb: MessageCallback): boolean {
    const set = this.subscribers.get(routeKey);
    if (set) {
      set.delete(cb);
      if (set.size === 0) {
        this.subscribers.delete(routeKey);
        return false;
      }
      return true;
    }
    return false;
  }

  private sendGatewayAction(action: 'SUBSCRIBE' | 'UNSUBSCRIBE', channel: string, topics?: string[]) {
    const payload: WSRequest = {
      action,
      channel,
      topics: topics && topics.length > 0 ? topics : undefined,
    };
    this.sendRaw(JSON.stringify(payload));
  }

  private sendRaw(data: string) {
    if (this.isNormal()) {
      this.ws?.send(data);
    } else {
      // 未连上时存入队列
      this.messageQueue.push(data);
    }
  }

  private flushMessageQueue() {
    while (this.messageQueue.length > 0 && this.isNormal()) {
      const msg = this.messageQueue.shift();
      if (msg) this.ws?.send(msg);
    }
  }

  private setStatus(nextStatus: WSStatus) {
    if (this.status !== nextStatus) {
      const prevStatus = this.status;
      this.status = nextStatus;
      this.emit('statusChange', { status: nextStatus, prevStatus });
    }
  }

  private clearAllTimers() {
    this.stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private emit(event: string, ...args: any[]) {
    this.eventListeners.get(event)?.forEach((listener) => {
      try {
        listener(...args);
      } catch (err) {
        console.error(`[UnifiedWS] Event ${event} listener error:`, err);
      }
    });
  }
}
