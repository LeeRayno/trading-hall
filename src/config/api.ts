/**
 * API configuration.
 *
 * Two different bases are in play and they are not interchangeable:
 *
 *   server   the real upstream origin, used by the REST proxy route and by
 *            anything else running on the server. This is the direct call.
 *   browser  what the browser prefixes to a path. It is the same-origin proxy,
 *            because the public upstream sends no CORS headers — a direct
 *            browser call is blocked before it is even sent.
 *
 * `MARKET_API_BASE_URL` overrides the server base. In development the local
 * proxy reaches the upstream; in production the server reaches it directly.
 * Nothing else in the application needs to know which.
 *
 * `NEXT_PUBLIC_MARKET_API_BASE_URL` overrides the browser base. It is only
 * correct to set it to an origin that serves CORS headers; the default
 * same-origin proxy is the supported configuration.
 */

/** Path prefix every upstream REST route shares. */
export const UPSTREAM_API_PREFIX = '/api';

/** Same-origin route the browser uses for REST calls. */
export const API_PROXY_PREFIX = '/api/market';

/** Default upstream when no override is configured. */
const DEFAULT_UPSTREAM_BASE_URL = 'https://api.kucoin.com';

/**
 * Upstream origin for server-side use.
 *
 * Never shipped to the browser: only the proxy route reads this.
 */
export function getUpstreamBaseUrl(): string {
  const configured = process.env.MARKET_API_BASE_URL;
  return (configured && configured.trim()) || DEFAULT_UPSTREAM_BASE_URL;
}

const configuredClientBase = process.env.NEXT_PUBLIC_MARKET_API_BASE_URL?.replace(/\/+$/, '');

/**
 * Base the browser client appends a path to.
 *
 * Paths are relative to the upstream API prefix, so the base must include it.
 * Both branches therefore resolve to something a path can be appended to
 * directly:
 *
 *   default      `/api/market`       -> same-origin proxy
 *   overridden   `<origin>/api`      -> direct upstream call, needs CORS
 */
export const API_BASE_URL = configuredClientBase
  ? `${configuredClientBase}${UPSTREAM_API_PREFIX}`
  : API_PROXY_PREFIX;

/** Per-request deadline. */
export const REQUEST_TIMEOUT_MS = 10_000;
