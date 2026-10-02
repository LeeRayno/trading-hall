import { notFound } from 'next/navigation';

import { TradingHall } from '@/components/trading/TradingHall';
import { getDictionary } from '@/i18n/dictionaries';
import { isLocale } from '@/i18n/config';
import { parseSymbol } from '@/lib/market-data/symbol';

/**
 * Trading hall for one pair, e.g. `/zh-CN/trade/BTC-USDT`.
 *
 * The symbol is validated here so a malformed pair is reported plainly instead
 * of being turned into a market data request that can only fail.
 */
export default async function TradePage({
  params,
}: PageProps<'/[locale]/trade/[symbol]'>) {
  const { locale, symbol: rawSymbol } = await params;
  if (!isLocale(locale)) notFound();

  const dictionary = getDictionary(locale);
  const symbol = parseSymbol(decodeURIComponent(rawSymbol));

  if (!symbol) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <div className="rounded-lg border border-border-subtle bg-panel px-6 py-8 text-center">
          <p className="text-lg font-medium text-down">{dictionary.errors.invalidSymbol}</p>
          <p className="mt-2 font-mono text-sm text-text-muted">{rawSymbol}</p>
        </div>
      </main>
    );
  }

  return <TradingHall symbol={symbol} />;
}
