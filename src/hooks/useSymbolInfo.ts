'use client';

/**
 * Pair metadata, used for display precision.
 *
 * Prices and sizes are rendered at the precision the pair actually quotes, so
 * a low-priced pair is not mangled by a fixed number of decimals. The provider
 * caches the symbol list, so following the route from one pair to another
 * costs at most one request.
 *
 * Metadata is presentation-only: when it is missing or the request fails,
 * callers fall back to the library's own formatting rather than blocking the
 * chart on it.
 */

import { useEffect, useState } from 'react';

import { getMarketDataProvider } from '@/lib/market-data/provider';
import type { Symbol, SymbolInfo } from '@/lib/market-data/types';

interface ResolvedSymbolInfo {
  symbol: Symbol;
  info: SymbolInfo | undefined;
}

export function useSymbolInfo(symbol: Symbol): SymbolInfo | undefined {
  const [resolved, setResolved] = useState<ResolvedSymbolInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    getMarketDataProvider()
      .getSymbolInfo(symbol, controller.signal)
      .then((info) => {
        if (!cancelled) setResolved({ symbol, info });
      })
      .catch(() => {
        // Not worth an error state — the chart degrades to default formatting.
        if (!cancelled) setResolved({ symbol, info: undefined });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [symbol]);

  // Matching on the symbol keeps the previous pair's metadata from being
  // applied to the new pair during the render before the effect resolves.
  return resolved?.symbol === symbol ? resolved.info : undefined;
}
