/**
 * How a module describes a failed request to the user.
 *
 * Shared by every module so that the same underlying failure reads the same
 * way wherever it surfaces. Only codes the user can act on get their own
 * wording; anything else is the generic notice, which keeps upstream detail
 * off the page.
 */

import type { Translator } from '@/i18n/I18nProvider';
import { MarketErrorCode, type MarketDataError } from '@/lib/market-data/errors';

export function describeFailure(t: Translator, error: MarketDataError): string {
  if (error.code === MarketErrorCode.INVALID_SYMBOL) return t('errors.invalidSymbol');
  if (error.code === MarketErrorCode.NETWORK) return t('errors.connectionLost');
  return t('errors.unableToLoad');
}

/**
 * Whether offering a retry makes sense.
 *
 * A pair that does not exist will not start existing, so that failure gets no
 * button. A book that could not be rebuilt is offered one even though it is
 * not marked retryable for automatic purposes: the feed may simply have had a
 * bad moment, and the user asking again is the right way to find out.
 */
export function canRetry(error: MarketDataError): boolean {
  if (error.code === MarketErrorCode.INVALID_SYMBOL) return false;
  return error.retryable || error.code === MarketErrorCode.SEQUENCE_GAP;
}
