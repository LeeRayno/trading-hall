'use client';

/**
 * Charting library attribution.
 *
 * The library's licence requires its attribution notice and a link to its
 * vendor on a user-visible page. The chart itself already renders the vendor
 * logo, which satisfies the link; this notice satisfies the text requirement.
 *
 * The vendor is the chart renderer, not the market data source, so naming it
 * does not breach the rule that no exchange may be named anywhere in the app.
 * Do not remove this without checking the licence.
 */

import { useTranslation } from '@/i18n/I18nProvider';

export function ChartAttribution() {
  const t = useTranslation();

  return (
    <p className="border-t border-border-subtle px-2 py-1 text-[10px] leading-tight text-text-muted">
      {t('chart.attribution')}{' '}
      <a
        href="https://www.tradingview.com/"
        target="_blank"
        rel="noreferrer noopener"
        className="underline transition-colors hover:text-text-secondary"
      >
        TradingView
      </a>
    </p>
  );
}
