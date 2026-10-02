/**
 * Defensive parsing helpers for upstream payloads.
 *
 * Upstream payloads are `unknown` until proven otherwise. Every adapter
 * funnels through these so a malformed field degrades to a dropped record
 * instead of a `NaN` leaking into the chart or the book.
 */

/** Parse a wire value that may arrive as a number or a numeric string. */
export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    if (value.trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Parse an id-like value into its string form without coercion surprises. */
export function toStringId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/** Narrow an `unknown` into a plain object. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Narrow an `unknown` into an array. */
export function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Normalise a trade side.
 *
 * Only the two known values are accepted; anything else is rejected so an
 * unexpected side can never be rendered as if it were directional.
 */
export function toTradeSide(value: unknown): 'buy' | 'sell' | null {
  return value === 'buy' || value === 'sell' ? value : null;
}

// ==================== Time normalisation ====================

export const MILLISECONDS_PER_SECOND = 1000;
export const NANOSECONDS_PER_MILLISECOND = 1_000_000;

/** Unix seconds -> Unix milliseconds. */
export function secondsToMilliseconds(seconds: number): number {
  return seconds * MILLISECONDS_PER_SECOND;
}

/** Unix milliseconds -> Unix seconds, floored to the containing second. */
export function millisecondsToSeconds(milliseconds: number): number {
  return Math.floor(milliseconds / MILLISECONDS_PER_SECOND);
}

/** Unix nanoseconds -> Unix milliseconds, floored. */
export function nanosecondsToMilliseconds(nanoseconds: number): number {
  return Math.floor(nanoseconds / NANOSECONDS_PER_MILLISECOND);
}
