/**
 * Concrete wire protocol for the public market data gateway.
 *
 * Envelope shapes (verified against the live gateway):
 *
 *   Client -> Server
 *     { "id": 1, "type": "subscribe",   "topic": "/market/candles:BTC-USDT_1min", "response": true }
 *     { "id": 2, "type": "unsubscribe", "topic": "/market/match:BTC-USDT",        "response": true }
 *     { "id": 3, "type": "ping" }
 *
 *   Server -> Client
 *     { "id": "1", "type": "ack" }
 *     { "id": "3", "type": "pong", "timestamp": 1790918438219860 }
 *     { "topic": "/market/level2:BTC-USDT", "type": "message", "subject": "trade.l2update", "data": { ... } }
 *
 * Note that the server echoes ids back as strings even when they were sent as
 * numbers, and that subscribing to an unknown symbol is acknowledged rather
 * than rejected — so symbol validity cannot be inferred from the ack stream and
 * must be checked by the REST layer.
 */

import type {
  WSControlFrame,
  WSDataFrame,
  WSFrame,
  WSProtocol,
} from '../ws/protocol';

const TYPE_MESSAGE = 'message';
const TYPE_PONG = 'pong';

export const WS_CONTROL_TYPES = [
  'welcome',
  'ack',
  'pong',
  'error',
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export const marketDataProtocol: WSProtocol = {
  name: 'market-data',

  encodeSubscribe(id: string, topic: string): string {
    return JSON.stringify({ id, type: 'subscribe', topic, response: true });
  },

  encodeUnsubscribe(id: string, topic: string): string {
    return JSON.stringify({ id, type: 'unsubscribe', topic, response: true });
  },

  encodePing(id: string): string {
    return JSON.stringify({ id, type: 'ping' });
  },

  decode(raw: unknown): WSFrame | null {
    const record = asRecord(raw);
    if (!record) return null;

    const type = asString(record.type);
    if (!type) return null;

    if (type === TYPE_MESSAGE) {
      const topic = asString(record.topic);
      // A business frame without a routable topic cannot be delivered.
      if (!topic) return null;
      const frame: WSDataFrame = {
        kind: 'data',
        topic,
        payload: record.data,
        raw,
      };
      return frame;
    }

    const frame: WSControlFrame = {
      kind: 'control',
      type,
      id: asString(record.id),
      message: asString(record.message) ?? asString(record.reason),
      raw,
    };
    return frame;
  },

  isPong(frame: WSFrame): boolean {
    return frame.kind === 'control' && frame.type === TYPE_PONG;
  },
};
