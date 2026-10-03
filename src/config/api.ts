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

/**
 * Deadlines for the whole-market request, at each end of the proxy hop.
 *
 * The 24-hour statistics for every listed pair measure about 480KB, against a
 * few KB for a candle page, and the shared 10s deadline leaves them no margin:
 * measured end to end at 4.7s, 6.1s and 7.3s on three consecutive calls over a
 * local connection, which is close enough that it failed outright during
 * testing. A deadline that trips on a healthy request is a bug of its own — the
 * user sees a load failure for a request that would have succeeded.
 *
 * Both ends need the larger budget, and they cannot be the same number. The
 * proxy is the one that talks to the upstream, so its deadline has to be the
 * shorter of the two: when the request really is stuck, the proxy can answer
 * with a failure that says so, which is more use than the client giving up a
 * moment later on a request that was already dead.
 *
 * The extra budget is for the size of the response rather than for a slow
 * upstream, so it buys transfer time without hiding an unresponsive server
 * behind a long wait.
 */
export const BULK_REQUEST_TIMEOUT_MS = 30_000;

/** The upstream hop's deadline for that same request. See above. */
export const BULK_UPSTREAM_TIMEOUT_MS = 25_000;
