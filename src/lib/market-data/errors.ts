/**
 * Internal error model.
 *
 * The UI must never surface a raw upstream error, so every failure crossing a
 * provider boundary is normalised into a `MarketDataError` with a stable code.
 * Presentation layers translate the code via i18n.
 */

export const MarketErrorCode = {
  /** Transport failure, timeout or non-JSON body. */
  NETWORK: 'network',
  /** The pair is not a tradable symbol. */
  INVALID_SYMBOL: 'invalid-symbol',
  /** Payload did not match the expected shape. */
  INVALID_RESPONSE: 'invalid-response',
  /** Upstream answered successfully but with no payload. */
  EMPTY_RESPONSE: 'empty-response',
  /** Upstream rejected the request. */
  UPSTREAM: 'upstream',
  /** Request was aborted, usually because the caller unmounted. */
  ABORTED: 'aborted',
  /** Local book state drifted and could not be trusted. */
  SEQUENCE_GAP: 'sequence-gap',
} as const;

export type MarketErrorCode = (typeof MarketErrorCode)[keyof typeof MarketErrorCode];

/** Codes that are worth retrying automatically. */
const RETRYABLE: ReadonlySet<MarketErrorCode> = new Set([
  MarketErrorCode.NETWORK,
  MarketErrorCode.UPSTREAM,
  MarketErrorCode.EMPTY_RESPONSE,
]);

export class MarketDataError extends Error {
  readonly code: MarketErrorCode;
  /**
   * Diagnostic context for logs. Never render this to end users: it may
   * contain upstream wording.
   */
  readonly detail?: string;

  constructor(code: MarketErrorCode, detail?: string, options?: { cause?: unknown }) {
    super(`[market-data] ${code}${detail ? `: ${detail}` : ''}`, options);
    this.name = 'MarketDataError';
    this.code = code;
    this.detail = detail;
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.code);
  }
}

/** Narrow an unknown throwable into a `MarketDataError`. */
export function toMarketDataError(error: unknown): MarketDataError {
  if (error instanceof MarketDataError) return error;

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new MarketDataError(MarketErrorCode.ABORTED, 'request aborted');
  }

  if (error instanceof Error) {
    return new MarketDataError(MarketErrorCode.NETWORK, error.message, { cause: error });
  }

  return new MarketDataError(MarketErrorCode.NETWORK, 'unknown failure');
}

export function isMarketDataError(error: unknown): error is MarketDataError {
  return error instanceof MarketDataError;
}
