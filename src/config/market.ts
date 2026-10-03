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

/**
 * Pairs shown in the hot strip.
 *
 * Ten fills a wide screen with enough left over to scroll, and it is ten live
 * subscriptions rather than the hundreds a whole-market one would cost: the
 * ranking is the only thing read market-wide, and it is read once.
 */
export const HOT_SYMBOLS_LIMIT = 10;

/**
 * How often the hot strip's quotes are published to React, in ms.
 *
 * The strip has ten independent sources pushing about every two seconds, so
 * this is not the book's throttle — nothing here is fast enough to need one.
 * It is a coalescing window: quotes that land together become one render
 * instead of ten, and half a second is far below the time it takes to read a
 * price, so nothing is seen late.
 */
export const HOT_SYMBOLS_FLUSH_INTERVAL_MS = 500;
