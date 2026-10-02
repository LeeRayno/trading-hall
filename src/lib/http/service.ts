/**
 * HTTP transport.
 *
 * The only module in the application that calls `fetch`. It owns URL building,
 * query serialisation, deadlines, cancellation plumbing, status handling and
 * JSON parsing, and it knows nothing about market data: it returns parsed JSON
 * and throws `HttpError`.
 *
 * Which endpoint to call, and what its payload means, belongs one layer up in
 * `market-data/trading.ts`.
 */

import { API_BASE_URL, REQUEST_TIMEOUT_MS } from '../../config/api';

export type HttpMethod = 'GET' | 'POST' | 'DELETE';

/**
 * Why a request failed, before it is given a domain meaning.
 *
 * Transport failures and domain failures are kept apart deliberately: this
 * layer can say "the server answered 502", but only the layer that knows the
 * endpoint can say "that pair is not tradable".
 */
export type HttpErrorKind =
  /** The caller cancelled, typically on unmount. */
  | 'aborted'
  /** The deadline elapsed before a response arrived. */
  | 'timeout'
  /** The request never reached the server. */
  | 'network'
  /** The server answered with a non-2xx status. */
  | 'status'
  /** The body was not JSON. */
  | 'parse';

export class HttpError extends Error {
  readonly kind: HttpErrorKind;
  /** Present only for `status`. */
  readonly status?: number;
  /** The full request URL, kept for diagnostics. */
  readonly url: string;

  constructor(
    kind: HttpErrorKind,
    url: string,
    detail: string,
    options?: { status?: number; cause?: unknown },
  ) {
    super(`[http] ${kind}: ${detail}`, options);
    this.name = 'HttpError';
    this.kind = kind;
    this.url = url;
    if (options?.status !== undefined) this.status = options.status;
  }
}

export type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  /** Appended as a query string; `undefined` and `null` entries are dropped. */
  query?: Record<string, QueryValue>;
  /** Caller-owned cancellation, typically tied to a component unmount. */
  signal?: AbortSignal;
  /** Overrides the client default for this request. */
  timeoutMs?: number;
  /** Short label used in error diagnostics, e.g. `candles`. */
  context?: string;
}

/** The three verbs the application needs. */
export interface HttpClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  post<T>(path: string, options?: RequestOptions): Promise<T>;
  /** `delete` is a reserved word, hence `del`. */
  del<T>(path: string, options?: RequestOptions): Promise<T>;
}

export interface HttpClientConfig {
  /** Prepended verbatim to every path, including any API prefix. */
  baseUrl: string;
  /** Injectable for tests and for server-side use. */
  fetchImpl?: typeof fetch;
  /** Per-request deadline in ms. */
  timeoutMs?: number;
}

export function createHttpClient(config: HttpClientConfig): HttpClient {
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const fetchImpl =
    config.fetchImpl ??
    ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
  const defaultTimeoutMs = config.timeoutMs ?? REQUEST_TIMEOUT_MS;

  async function request<T>(
    method: HttpMethod,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = buildUrl(baseUrl, path, options.query);
    const context = options.context ?? path;
    const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;

    // A caller signal must be able to cancel, and the deadline must fire even
    // when there is no caller signal, so both are combined onto one controller.
    const controller = new AbortController();
    const onAbort = () => controller.abort(options.signal?.reason);
    if (options.signal) {
      if (options.signal.aborted) onAbort();
      else options.signal.addEventListener('abort', onAbort, { once: true });
    }

    // Tracked separately because an aborted fetch rejects the same way whether
    // the caller cancelled or the deadline fired; only this flag tells them
    // apart, and the two map to different domain errors.
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const classify = (error: unknown): HttpError => {
      if (options.signal?.aborted) {
        return new HttpError('aborted', url, `${context}: cancelled by caller`, { cause: error });
      }
      if (timedOut) {
        return new HttpError('timeout', url, `${context}: timed out after ${timeoutMs}ms`, {
          cause: error,
        });
      }
      const detail = error instanceof Error ? error.message : String(error);
      return new HttpError('network', url, `${context}: ${detail}`, { cause: error });
    };

    try {
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method,
          headers: { accept: 'application/json' },
          signal: controller.signal,
          cache: 'no-store',
          credentials: 'omit',
        });
      } catch (error) {
        throw classify(error);
      }

      if (!response.ok) {
        throw new HttpError('status', url, `${context}: HTTP ${response.status}`, {
          status: response.status,
        });
      }

      try {
        return (await response.json()) as T;
      } catch (error) {
        // A body that fails mid-read because the request was cancelled is a
        // cancellation, not a malformed payload.
        if (options.signal?.aborted || timedOut) throw classify(error);
        throw new HttpError('parse', url, `${context}: malformed JSON`, { cause: error });
      }
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }
  }

  return {
    get: (path, options) => request('GET', path, options),
    post: (path, options) => request('POST', path, options),
    del: (path, options) => request('DELETE', path, options),
  };
}

/**
 * The application's default client, pointed at the configured API base.
 *
 * `market-data/trading.ts` is its only consumer; anything that needs a
 * different base or an injected `fetch` builds its own with
 * `createHttpClient`.
 */
export const http = createHttpClient({ baseUrl: API_BASE_URL });

/** Convenience bindings for the default client. */
export const get = http.get;
export const post = http.post;
export const del = http.del;

function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, QueryValue>,
): string {
  const url = `${baseUrl}${path}`;
  if (!query) return url;

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    search.set(key, String(value));
  }

  const qs = search.toString();
  return qs ? `${url}?${qs}` : url;
}
