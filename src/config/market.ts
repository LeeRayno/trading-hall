/**
 * Market-facing configuration shared by the UI layer.
 *
 * Kept separate from the provider so that swapping data sources never touches
 * these values, and so the route layer has somewhere to point a bare locale
 * URL.
 */

/** Pair shown when a locale URL is opened without an explicit symbol. */
export const DEFAULT_SYMBOL = 'BTC-USDT';

/** Pairs offered in the symbol switcher. */
export const POPULAR_SYMBOLS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'] as const;

/** Interval the chart opens on. */
export const DEFAULT_TIMEFRAME = '15m' as const;

/** Number of book levels rendered per side. */
export const ORDER_BOOK_DISPLAY_DEPTH = 20;

/**
 * How often the book mirror is published to React, in ms.
 *
 * The book feed is the busiest stream in the hall — it pushes hundreds of
 * frames a second — so updates are accumulated in the mirror and handed to the
 * component tree on this timer instead of once per frame (spec §29, §38).
 * Faster than the eye can follow, slower than the feed.
 */
export const ORDER_BOOK_FLUSH_INTERVAL_MS = 150;

/**
 * Levels kept per side before the far end is pruned.
 *
 * A safety valve against an unbounded map, not routine maintenance: the feed
 * is depth-scoped, so a healthy mirror stays in the tens.
 */
export const ORDER_BOOK_MAX_LEVELS = 1000;

/**
 * Consecutive rebuild failures tolerated before the panel reports an error.
 *
 * Each rebuild costs a REST request, so a feed that keeps arriving with gaps
 * must not be allowed to retry forever at full speed.
 */
export const ORDER_BOOK_MAX_RESYNC_ATTEMPTS = 5;

/** Maximum rows kept in the trade tape. */
export const MAX_RECENT_TRADES = 100;
