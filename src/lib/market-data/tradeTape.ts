/**
 * The trade tape: a bounded, newest-first, de-duplicated list of prints.
 *
 * Spec §32 caps the tape and de-duplicates by trade id; §46 requires the newest
 * print at the top. Both rules live here rather than in the component, so no
 * caller can grow the list without bound or count a print twice.
 *
 * It sits outside React for the same reason as the book mirror: the feed owns
 * this structure, and a component only ever reads a snapshot of it.
 */

import type { RecentTrade } from './types';

export class TradeTape {
  private readonly trades: RecentTrade[] = [];
  /**
   * Ids currently on the tape. Rebuilt whenever the list is trimmed, so it
   * tracks the tape exactly instead of growing with every print ever seen.
   */
  private readonly seen = new Set<string>();

  constructor(private readonly maxRecords: number) {}

  /** Prints, newest first. */
  get list(): readonly RecentTrade[] {
    return this.trades;
  }

  get size(): number {
    return this.trades.length;
  }

  /** Timestamp of the newest print on the tape, or null when empty. */
  get newest(): number | null {
    return this.trades[0]?.timestamp ?? null;
  }

  /** Merge prints in, returning whether the tape changed. */
  add(incoming: readonly RecentTrade[]): boolean {
    let changed = false;

    for (const trade of incoming) {
      if (!isUsable(trade) || this.seen.has(trade.id)) continue;
      this.seen.add(trade.id);
      this.trades.push(trade);
      changed = true;
    }

    if (!changed) return false;

    // Sorted by time, and the sort is stable: prints sharing a millisecond —
    // which is normal, several per millisecond at busy moments — keep the
    // order they arrived in rather than swapping places between updates.
    this.trades.sort((a, b) => b.timestamp - a.timestamp);

    if (this.trades.length > this.maxRecords) {
      // Truncation keeps the newest, because the list is sorted newest-first.
      this.trades.length = this.maxRecords;
      this.seen.clear();
      for (const trade of this.trades) this.seen.add(trade.id);
    }

    return true;
  }

  clear(): void {
    this.trades.length = 0;
    this.seen.clear();
  }
}

/**
 * A print the tape will hold. Anything malformed is dropped rather than
 * rendered: a trade with no size or no time is not a print the user can act on
 * (spec §44's rule for the book, applied to the tape).
 */
function isUsable(trade: RecentTrade): boolean {
  return (
    typeof trade.id === 'string' &&
    trade.id !== '' &&
    Number.isFinite(trade.price) &&
    trade.price > 0 &&
    Number.isFinite(trade.size) &&
    trade.size > 0 &&
    Number.isFinite(trade.timestamp) &&
    trade.timestamp > 0
  );
}
