/**
 * Local order book mirror.
 *
 * The book the UI shows is not the upstream's book. It is built from one REST
 * snapshot and then kept current by the incremental feed, which is the only
 * way to show a live book without re-downloading it constantly (spec §16).
 *
 * This module is deliberately outside React. The feed pushes hundreds of
 * updates a second, and every one of them mutates this structure and nothing
 * else; the component tree is only told about the result on a timer (spec §29,
 * §38).
 *
 * Prices are keyed as strings. A level's identity is its exact quoted price,
 * and keying by number would treat `86092.70` and `86092.7` as one level in
 * some code paths and two in others.
 */

import type { OrderBook, OrderBookLevel, OrderBookUpdate } from './types';

/** What became of an incoming increment. */
export type ApplyResult =
  /** Applied; the mirror is still consistent. */
  | 'applied'
  /** Already covered by the mirror — a duplicate or a late frame. */
  | 'stale'
  /** The feed skipped updates, so the mirror now has holes. */
  | 'gap';

export class LocalOrderBook {
  /** Keyed by price; the value carries the numeric price so flushes never re-parse. */
  private readonly bids = new Map<string, OrderBookLevel>();
  private readonly asks = new Map<string, OrderBookLevel>();
  private seq: number;

  constructor(snapshot: OrderBook) {
    for (const level of snapshot.bids) {
      if (isUsable(level)) this.bids.set(keyOf(level.price), level);
    }
    for (const level of snapshot.asks) {
      if (isUsable(level)) this.asks.set(keyOf(level.price), level);
    }
    this.seq = toSequence(snapshot.sequence);
  }

  /** Sequence the mirror currently reflects. */
  get sequence(): number {
    return this.seq;
  }

  /**
   * Apply one increment.
   *
   * The sequence bounds decide everything: an update wholly behind the mirror
   * is a duplicate, and one that starts beyond the next expected sequence
   * means frames were missed and the mirror must be rebuilt. Guessing is not
   * an option here — a book with a hole in it produces prices that were never
   * tradable, which is worse than no book at all (spec §30).
   */
  apply(update: OrderBookUpdate): ApplyResult {
    const start = toSequence(update.sequenceStart);
    const end = toSequence(update.sequenceEnd);

    // An unreadable sequence means the ordering cannot be established at all,
    // so the mirror is treated as untrustworthy rather than assumed good.
    if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(this.seq)) {
      return 'gap';
    }

    if (end <= this.seq) return 'stale';
    if (start > this.seq + 1) return 'gap';

    applySide(this.bids, update.bids);
    applySide(this.asks, update.asks);
    this.seq = end;
    return 'applied';
  }

  /** Best `depth` levels per side, correctly ordered for display. */
  levels(depth: number): { bids: OrderBookLevel[]; asks: OrderBookLevel[] } {
    return {
      // Bids descend from the best bid; asks ascend from the best ask.
      bids: sorted(this.bids, depth, (a, b) => b.price - a.price),
      asks: sorted(this.asks, depth, (a, b) => a.price - b.price),
    };
  }

  /** Levels currently mirrored per side. Used by the leak guard and by tests. */
  get size(): { bids: number; asks: number } {
    return { bids: this.bids.size, asks: this.asks.size };
  }

  /**
   * Drop levels beyond `maxLevels` per side, farthest from the spread first.
   *
   * A safety valve, not routine maintenance: the feed is depth-scoped, so a
   * healthy mirror holds a few dozen levels and this never fires. It exists so
   * that a pathological stream cannot grow the maps without bound. Anything
   * dropped here is restored by the next snapshot, and any resulting
   * inconsistency is caught by the sequence check.
   */
  prune(maxLevels: number): void {
    // Ordered from the spread outward: the highest bids and the lowest asks are
    // the ones kept. Reversing either of these keeps the far end of the book
    // and discards the half the UI actually renders.
    pruneSide(this.bids, maxLevels, (a, b) => b.price - a.price);
    pruneSide(this.asks, maxLevels, (a, b) => a.price - b.price);
  }
}

/**
 * Apply one side of an increment.
 *
 * A size of zero is how the feed retires a level; anything else replaces it.
 * Negative sizes are rejected outright — the adapter already filters them, and
 * repeating the check here means a book can never render one (spec §44).
 */
function applySide(side: Map<string, OrderBookLevel>, levels: OrderBookLevel[]): void {
  for (const level of levels) {
    if (!Number.isFinite(level.price) || level.price <= 0) continue;
    if (!Number.isFinite(level.size) || level.size < 0) continue;

    const key = keyOf(level.price);
    if (level.size === 0) side.delete(key);
    else side.set(key, level);
  }
}

/** Keep the levels nearest the spread, which are the ones the UI shows. */
function pruneSide(
  side: Map<string, OrderBookLevel>,
  maxLevels: number,
  bestFirst: (a: OrderBookLevel, b: OrderBookLevel) => number,
): void {
  if (side.size <= maxLevels) return;

  const kept = [...side.values()].sort(bestFirst).slice(0, maxLevels);
  side.clear();
  for (const level of kept) side.set(keyOf(level.price), level);
}

function sorted(
  side: Map<string, OrderBookLevel>,
  depth: number,
  compare: (a: OrderBookLevel, b: OrderBookLevel) => number,
): OrderBookLevel[] {
  const levels = [...side.values()];
  levels.sort(compare);
  return depth > 0 ? levels.slice(0, depth) : levels;
}

function isUsable(level: OrderBookLevel): boolean {
  return (
    Number.isFinite(level.price) &&
    level.price > 0 &&
    Number.isFinite(level.size) &&
    level.size > 0
  );
}

function keyOf(price: number): string {
  return String(price);
}

/**
 * Sequence bounds arrive as decimal strings because they exceed the range a
 * 32-bit counter would need. They stay well inside `Number.MAX_SAFE_INTEGER`,
 * so numeric comparison is exact.
 */
function toSequence(value: string): number {
  return Number(value);
}

/** Best bid, best ask, and the gap between them. */
export function spreadOf(
  bids: OrderBookLevel[],
  asks: OrderBookLevel[],
): number | null {
  const bestBid = bids[0]?.price;
  const bestAsk = asks[0]?.price;
  if (bestBid === undefined || bestAsk === undefined) return null;
  return bestAsk - bestBid;
}

/**
 * Everything the panel's depth display needs, derived from one side pair.
 *
 * The two total arrays are aligned with the array each was computed from — the
 * best-first order `levels()` returns. The ask side is reversed for display, so
 * a total must be paired with its level *before* that reversal: taking them by
 * index afterwards pairs every total with the wrong price.
 */
export interface OrderBookDepth {
  /** Cumulative size from the spread outward, aligned with `bids`. */
  bidTotals: number[];
  /** Cumulative size from the spread outward, aligned with `asks`. */
  askTotals: number[];
  /** Largest single level per side, which is what a depth bar is drawn against. */
  bidMaxSize: number;
  askMaxSize: number;
  /** Resting size per side. */
  bidSize: number;
  askSize: number;
  /** Bids' share of the resting size, 0..1, or null when both sides are empty. */
  bidShare: number | null;
}

/**
 * Running total from the best price outward.
 *
 * The level against the spread carries its own size, and each level further out
 * adds everything between it and the spread — so the last entry is the depth of
 * everything passed in. Only the levels given are summed: this is the display
 * depth, not the whole upstream book.
 */
export function cumulativeSizes(levels: OrderBookLevel[]): number[] {
  const totals: number[] = [];
  let running = 0;

  for (const level of levels) {
    running += level.size;
    totals.push(running);
  }

  return totals;
}

/**
 * Largest single level on a side, or 0 for an empty one.
 *
 * `Math.max()` of nothing is `-Infinity`, which would scale every depth bar
 * down to nothing.
 */
export function largestSize(levels: OrderBookLevel[]): number {
  let largest = 0;

  for (const level of levels) {
    if (level.size > largest) largest = level.size;
  }

  return largest;
}

/** Derive every depth figure the panel shows from one pair of ordered sides. */
export function depthOf(bids: OrderBookLevel[], asks: OrderBookLevel[]): OrderBookDepth {
  const bidTotals = cumulativeSizes(bids);
  const askTotals = cumulativeSizes(asks);
  const bidSize = bidTotals.at(-1) ?? 0;
  const askSize = askTotals.at(-1) ?? 0;
  const resting = bidSize + askSize;

  return {
    bidTotals,
    askTotals,
    bidMaxSize: largestSize(bids),
    askMaxSize: largestSize(asks),
    bidSize,
    askSize,
    // Two empty sides are the one case with no split to show, and dividing by
    // nothing would render as `NaN%` rather than as an absence.
    bidShare: resting > 0 ? bidSize / resting : null,
  };
}
