/**
 * Wire-protocol abstraction for the generic WebSocket transport.
 *
 * The transport in `UnifiedWSClient` owns everything that is protocol
 * independent: connection lifecycle, subscription bookkeeping, heartbeats,
 * exponential-backoff reconnection and the outbound queue.
 *
 * Everything that is specific to one gateway's envelope format lives behind
 * this interface, so a different upstream can be supported by supplying a
 * different codec instead of rewriting the transport.
 */

/** A transport-level frame (welcome / ack / pong / error / ...). */
export interface WSControlFrame {
  kind: 'control';
  /** Protocol-defined control type, e.g. `welcome`, `ack`, `pong`, `error`. */
  type: string;
  /** Correlation id, when the protocol echoes one back. */
  id?: string;
  /** Human readable reason, when the protocol provides one. */
  message?: string;
  /** The original decoded frame, for protocol-specific inspection. */
  raw: unknown;
}

/** A business frame addressed to a topic. */
export interface WSDataFrame {
  kind: 'data';
  /** The topic this frame was published on, used for routing. */
  topic: string;
  /** Provider-specific payload. Adapters own its shape. */
  payload: unknown;
  /** The original decoded frame. */
  raw: unknown;
}

export type WSFrame = WSControlFrame | WSDataFrame;

/** Monotonic id generator for correlating control frames. */
export type WSIdGenerator = () => string;

export interface WSProtocol {
  /** Short identifier used in logs. */
  readonly name: string;

  /** Serialise a subscribe request for `topic`. */
  encodeSubscribe(id: string, topic: string): string;

  /** Serialise an unsubscribe request for `topic`. */
  encodeUnsubscribe(id: string, topic: string): string;

  /** Serialise an application-level heartbeat ping. */
  encodePing(id: string): string;

  /**
   * Decode a raw inbound message.
   * Returns `null` for frames the transport should ignore.
   */
  decode(raw: unknown): WSFrame | null;

  /** Whether a frame is the reply to a heartbeat ping. */
  isPong(frame: WSFrame): boolean;
}

/** Default id generator: strictly increasing, stable within a session. */
export function createSequentialIdGenerator(prefix = ''): WSIdGenerator {
  let seq = 0;
  return () => `${prefix}${++seq}`;
}
