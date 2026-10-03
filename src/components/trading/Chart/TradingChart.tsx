'use client';

/**
 * Candlestick chart.
 *
 * The chart owns its own render loop: histograms and candles are pushed
 * straight into the series objects, outside React. Nothing here re-renders on
 * a price tick — the only state that reaches this component at market rate is
 * a ref write inside a callback, which is what keeps a fast pair from
 * thrashing the tree.
 *
 * Bars are applied with `setData` once per pair/interval and `update` for
 * everything after that. Re-sending the whole series on each tick would work
 * but discards the incremental path the library is built around, and it also
 * resets the user's zoom on every price change.
 */

import {
  CandlestickSeries,
  HistogramSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import { useCallback, useEffect, useRef } from 'react';

import { Spinner } from '@/components/common/Spinner';
import { PanelNotice } from '@/components/trading/PanelNotice';
import { canRetry, describeFailure } from '@/components/trading/failure';
import {
  CHART_LAYOUT,
  CHART_PALETTES,
  candleOptions,
  chartOptions,
  type ChartPalette,
} from '@/config/chart';
import { useMarketKlines } from '@/hooks/useMarketKlines';
import { useSymbolInfo } from '@/hooks/useSymbolInfo';
import { useTheme } from '@/hooks/useTheme';
import { useTranslation } from '@/i18n/I18nProvider';
import { getTheme } from '@/lib/theme/theme';
import { pricePrecisionOf, sizePrecisionOf } from '@/lib/market-data/symbol';
import { ConnectionState, type Candle, type Symbol, type Timeframe } from '@/lib/market-data/types';

interface TradingChartProps {
  symbol: Symbol;
  timeframe: Timeframe;
}

/** Index of the volume pane, below the price pane. */
const VOLUME_PANE_INDEX = 1;

export function TradingChart({ symbol, timeframe }: TradingChartProps) {
  const t = useTranslation();
  const theme = useTheme();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  /** Open time of the newest bar; `update` rejects anything older. */
  const lastBarTimeRef = useRef<number | null>(null);
  /** Pair/interval the series currently holds, to tell a switch from a refresh. */
  const loadedKeyRef = useRef<string | null>(null);

  const key = `${symbol}|${timeframe}`;

  const applyLiveCandle = useCallback((candle: Candle) => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries || !volumeSeries) return;

    // The bar's colour is baked into the point, so this needs the palette too.
    // Re-creating the callback on a theme change is free: the hook holds it in
    // a ref, so no subscription is opened by the new identity.
    const palette = CHART_PALETTES[theme];

    const lastBarTime = lastBarTimeRef.current;
    // A bar older than the newest one on the series belongs to a previous
    // subscription that has not finished tearing down. Feeding it to `update`
    // would throw, so it is dropped instead.
    if (lastBarTime !== null && candle.time < lastBarTime) return;

    candleSeries.update({
      time: candle.time as UTCTimestamp,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    });
    volumeSeries.update(toVolumePoint(candle, palette));
    lastBarTimeRef.current = candle.time;
  }, [theme]);

  const { status, error, connection, history, refresh } = useMarketKlines({
    symbol,
    timeframe,
    onCandle: applyLiveCandle,
  });

  const symbolInfo = useSymbolInfo(symbol);

  // Chart and series lifetime. Created once; the pair and interval are applied
  // to the existing series by the data effect rather than by rebuilding it,
  // and the theme by the effect below rather than by re-running this one —
  // rebuilding would throw away the user's zoom along with the canvas.
  //
  // The theme is read from the document rather than taken from the hook, which
  // is why this effect can keep an empty dependency list. On the first render
  // the two agree anyway: the boot script has already run, so the attribute is
  // the answer the hook would give.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const palette = CHART_PALETTES[getTheme()];

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      ...chartOptions(palette),
    });

    const candleSeries = chart.addSeries(CandlestickSeries, candleOptions(palette), 0);

    // Volume gets its own pane so it cannot overlap the price scale.
    chart.addPane();
    const volumeSeries = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: { type: 'volume' },
        priceLineVisible: false,
        lastValueVisible: false,
      },
      VOLUME_PANE_INDEX,
    );
    chart.panes()[VOLUME_PANE_INDEX]?.setHeight(CHART_LAYOUT.volumePaneHeight);

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      chart.applyOptions({ width: Math.floor(width), height: Math.floor(height) });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();

      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      lastBarTimeRef.current = null;
      loadedKeyRef.current = null;
    };
  }, []);

  // Re-theming, in place. Only the chart and the candles are handled here: the
  // volume histogram carries its colour per data point rather than as a series
  // option, so it cannot be repainted from this side and is left to the data
  // effect, which re-sends the bars.
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries) return;

    const palette = CHART_PALETTES[theme];
    chart.applyOptions(chartOptions(palette));
    candleSeries.applyOptions(candleOptions(palette));
  }, [theme]);

  // Data. `setData` here is the only wholesale replacement; live bars take the
  // incremental path above.
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!chart || !candleSeries || !volumeSeries) return;

    if (history === null) {
      // Pair or interval changed and the new history has not landed. Clearing
      // beats leaving the previous pair's bars under the new heading.
      candleSeries.setData([]);
      volumeSeries.setData([]);
      lastBarTimeRef.current = null;
      loadedKeyRef.current = null;
      return;
    }

    const isSameSeries = loadedKeyRef.current === key;
    // A refresh of the same series (a reconnect backfill) must not move the
    // viewport the user was reading.
    const previousRange = isSameSeries ? chart.timeScale().getVisibleLogicalRange() : null;

    const palette = CHART_PALETTES[theme];

    candleSeries.setData(
      history.map((candle) => ({
        time: candle.time as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    );
    // Re-sent on a theme change as well as on a data change, because the
    // colour is part of each point. That costs one redundant pass over the
    // bars on a click, and it keeps the zoom: the range captured above is
    // restored below exactly as it is for a backfill. Passed through an arrow
    // rather than by name — `map` would hand the palette the array index.
    volumeSeries.setData(history.map((candle) => toVolumePoint(candle, palette)));

    const newest = history.at(-1);
    lastBarTimeRef.current = newest ? newest.time : null;
    loadedKeyRef.current = key;

    if (previousRange) {
      chart.timeScale().setVisibleLogicalRange(previousRange);
    } else {
      chart.timeScale().fitContent();
    }
  }, [history, key, theme]);

  // Display precision, from the pair's quoted increments. Applied only once
  // metadata is known: inventing a precision before then would be wrong for
  // most pairs and the library's own formatting is a better placeholder.
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries || !volumeSeries || !symbolInfo) return;

    const priceStep = Number(symbolInfo.priceIncrement);
    const sizeStep = Number(symbolInfo.baseIncrement);
    if (!Number.isFinite(priceStep) || priceStep <= 0) return;

    candleSeries.applyOptions({
      priceFormat: {
        type: 'price',
        precision: pricePrecisionOf(symbolInfo),
        minMove: priceStep,
      },
    });

    if (Number.isFinite(sizeStep) && sizeStep > 0) {
      volumeSeries.applyOptions({
        priceFormat: {
          type: 'volume',
          precision: sizePrecisionOf(symbolInfo),
          minMove: sizeStep,
        },
      });
    }
  }, [symbolInfo]);

  const isReconnecting =
    connection === ConnectionState.RECONNECTING || connection === ConnectionState.DISCONNECTED;

  const failed = status === 'error' && error !== null;
  // A failed first load leaves nothing to show, so it takes the frame. A
  // failed refresh still has the previous bars, which are worth more than the
  // error, so that case only gets the unobtrusive notice.
  const showErrorPanel = failed && history === null;
  const showErrorNotice = failed && history !== null;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {status === 'loading' && history === null ? (
        <PanelNotice>
          {/* The same size the panels use. It was tried smaller, to match the
              pill's text, and at that size the ring thins out to a hairline
              that reads as a smudge on the notice rather than as work in
              progress. */}
          <Spinner />
        </PanelNotice>
      ) : null}

      {showErrorPanel ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 px-4 text-center">
          <p className="text-sm text-down">{describeFailure(t, error)}</p>
          {/* A pair that does not exist will not start existing on a retry. */}
          {canRetry(error) ? (
            <button
              type="button"
              onClick={refresh}
              className="rounded border border-border-subtle px-3 py-1 text-xs text-text-secondary transition-colors hover:bg-panel-hover hover:text-foreground"
            >
              {t('common.retry')}
            </button>
          ) : null}
        </div>
      ) : null}

      {showErrorNotice ? <PanelNotice tone="down">{describeFailure(t, error)}</PanelNotice> : null}

      {isReconnecting && !failed ? (
        <PanelNotice>{t('errors.reconnecting')}</PanelNotice>
      ) : null}
    </div>
  );
}

function toVolumePoint(candle: Candle, palette: ChartPalette) {
  return {
    time: candle.time as UTCTimestamp,
    value: candle.volume,
    color: candle.close >= candle.open ? palette.volumeUp : palette.volumeDown,
  };
}
