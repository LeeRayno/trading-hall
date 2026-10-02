/**
 * Symbol parsing and validation.
 *
 * Bad symbols are rejected before they reach the network. This matters because
 * the upstream acknowledges a subscription to an unknown pair instead of
 * failing it, so a typo would otherwise show up as a permanently silent panel
 * rather than a clear error.
 */

import type { Symbol, SymbolInfo } from './types';

/**
 * `<BASE>-<QUOTE>`, both alphanumeric. Deliberately permissive about the
 * characters and strict about the shape: the authoritative answer on whether a
 * pair is tradable comes from the exchange's symbol list.
 */
const SYMBOL_PATTERN = /^[A-Z0-9]{2,20}-[A-Z0-9]{2,20}$/;

/** Uppercase and trim a raw route segment. */
export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidSymbol(raw: string): raw is Symbol {
  return SYMBOL_PATTERN.test(normalizeSymbol(raw));
}

/** Return the normalized symbol, or `null` when it is malformed. */
export function parseSymbol(raw: string): Symbol | null {
  const symbol = normalizeSymbol(raw);
  return SYMBOL_PATTERN.test(symbol) ? symbol : null;
}

/** Split a symbol into its base and quote currencies. */
export function splitSymbol(symbol: Symbol): { base: string; quote: string } | null {
  const [base, quote] = normalizeSymbol(symbol).split('-');
  if (!base || !quote) return null;
  return { base, quote };
}

/**
 * Number of decimal places implied by a step size.
 *
 * `0.0001` yields 4. Used to render prices and sizes at the precision the
 * exchange actually quotes, rather than a hardcoded `toFixed(2)` that would
 * mangle low-priced pairs.
 */
export function precisionFromIncrement(increment: string): number {
  if (!increment.includes('.')) return 0;
  const decimals = increment.split('.')[1] ?? '';
  return decimals.replace(/0+$/, '').length;
}

/** Display precision for a pair, with a conservative fallback. */
export function pricePrecisionOf(info: SymbolInfo | undefined, fallback = 2): number {
  if (!info) return fallback;
  return precisionFromIncrement(info.priceIncrement);
}

/** Size precision for a pair, with a conservative fallback. */
export function sizePrecisionOf(info: SymbolInfo | undefined, fallback = 4): number {
  if (!info) return fallback;
  return precisionFromIncrement(info.baseIncrement);
}
