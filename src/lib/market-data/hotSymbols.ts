/**
 * Ranking the pairs the hot strip shows.
 *
 * "Hot" is not something the provider publishes — there is no trending or
 * most-traded endpoint — so it is derived here: the pairs the hall can
 * actually open, ordered by traded value over the last 24 hours. A
 * whole-market ticker snapshot is the only input that can answer that in one
 * request, and fetching it is the caller's job.
 *
 * Kept pure and outside React for the same reason as the book's derivations:
 * this is the part with a rule in it, and a rule is worth testing without a
 * socket, a timer or a render around it.
 */

import type { Symbol, SymbolInfo, Ticker } from './types';

/**
 * The quote currency the strip ranks in.
 *
 * A quote volume is only comparable with another quote volume, so the strip
 * cannot mix markets: 500 USDT of one pair and 500 BTC of another are not the
 * same amount of business. USDT is also the quote the hall opens on.
 */
const QUOTE_CURRENCY = 'USDT';

/**
 * The busiest `limit` pairs, best first.
 *
 * Only pairs the hall supports are eligible, because every entry in the strip
 * links to that pair's page — showing a pair the app cannot open would render
 * a link to nowhere. Pairs the provider has switched off are excluded for the
 * same reason.
 */
export function rankHotSymbols(
  tickers: readonly Ticker[],
  tradable: readonly SymbolInfo[],
  limit: number,
): Symbol[] {
  if (limit <= 0) return [];

  const eligible = new Set<Symbol>();
  for (const info of tradable) {
    if (info.enableTrading && info.quoteCurrency === QUOTE_CURRENCY) {
      eligible.add(info.symbol);
    }
  }

  // `filter` copies, so the caller's array is not reordered under it.
  const ranked = tickers.filter((ticker) => eligible.has(ticker.symbol));

  ranked.sort(
    (a, b) =>
      // Ties are broken by name rather than left to the sort, because the
      // input order is whatever the upstream payload happened to list. Without
      // this, a pair with no volume at all could swap places between loads and
      // the strip would reshuffle on its own.
      b.quoteVolume - a.quoteVolume ||
      (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0),
  );

  return ranked.slice(0, limit).map((ticker) => ticker.symbol);
}
