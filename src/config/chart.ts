/**
 * Chart presentation constants.
 *
 * The chart renders to a canvas, which cannot resolve CSS custom properties,
 * so the palettes are repeated here as literal values. These mirror the tokens
 * in `globals.css`; changing a token there means changing its counterpart
 * here, in both themes.
 *
 * The option builders below exist for the same reason: the chart is created
 * once and then re-themed in place, and the two paths have to agree. Building
 * the options in one place is what keeps a theme change from drifting away
 * from what a fresh chart would have been given.
 */

import {
  CrosshairMode,
  LineStyle,
  type DeepPartial,
  type ChartOptions,
  type CandlestickStyleOptions,
} from 'lightweight-charts';

import type { Theme } from '@/lib/theme/theme';

export interface ChartPalette {
  background: string;
  text: string;
  border: string;
  /** One step off the background — a guide, not a line. */
  grid: string;
  crosshair: string;
  up: string;
  down: string;
  volumeUp: string;
  volumeDown: string;
}

export const CHART_PALETTES: Readonly<Record<Theme, ChartPalette>> = {
  dark: {
    background: '#0b0e11',
    text: '#a7b1bc',
    border: '#1e252e',
    grid: '#161b22',
    crosshair: '#6b7683',
    up: '#0ecb81',
    down: '#f6465d',
    // Volume bars are tinted with their candle's direction rather than drawn
    // solid, so they read as an underlay to the price rather than as a second
    // signal competing with it.
    volumeUp: 'rgba(14, 203, 129, 0.45)',
    volumeDown: 'rgba(246, 70, 93, 0.45)',
  },
  light: {
    background: '#f5f6f8',
    text: '#4a5461',
    border: '#dfe3e8',
    grid: '#e8ebef',
    crosshair: '#6b7683',
    up: '#0a7d4f',
    down: '#c62a41',
    volumeUp: 'rgba(10, 125, 79, 0.4)',
    volumeDown: 'rgba(198, 42, 65, 0.4)',
  },
};

/**
 * Everything that belongs to the chart itself rather than to a series.
 *
 * The canvas is drawn on the page colour while the panel around it is the
 * panel colour, in both themes: the chart reads as a recess in its frame
 * rather than as another panel, and keeping that relationship means inverting
 * which of the two is lighter, not which of them the canvas gets.
 */
export function chartOptions(palette: ChartPalette): DeepPartial<ChartOptions> {
  return {
    layout: {
      background: { color: palette.background },
      textColor: palette.text,
      // Required by the charting library's licence: the logo links back to
      // its vendor, which satisfies the attribution link requirement.
      attributionLogo: true,
    },
    grid: {
      vertLines: { color: palette.grid },
      horzLines: { color: palette.grid },
    },
    rightPriceScale: {
      borderColor: palette.border,
    },
    timeScale: {
      borderColor: palette.border,
      timeVisible: true,
      secondsVisible: false,
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: palette.crosshair,
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: palette.border,
      },
      horzLine: {
        color: palette.crosshair,
        width: 1,
        style: LineStyle.Dashed,
        labelBackgroundColor: palette.border,
      },
    },
  };
}

export function candleOptions(palette: ChartPalette): DeepPartial<CandlestickStyleOptions> {
  return {
    upColor: palette.up,
    downColor: palette.down,
    borderUpColor: palette.up,
    borderDownColor: palette.down,
    wickUpColor: palette.up,
    wickDownColor: palette.down,
  };
}

export const CHART_LAYOUT = {
  /** Height in pixels of the volume pane below the price pane. */
  volumePaneHeight: 72,
  /** Milliseconds of resize settling before a relayout is applied. */
  resizeDebounceMs: 80,
} as const;
